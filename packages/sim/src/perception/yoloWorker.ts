/// <reference lib="webworker" />
import * as ort from 'onnxruntime-web/wasm';
import ortWasmUrl from 'onnxruntime-web/ort-wasm-simd-threaded.wasm?url';
import { YOLO_DECODE_SCORE_MIN, YOLO_INPUT_PX, YOLO_IOU_THRESHOLD, decodeYolo, labelFromName, letterbox, nms, parseModelMeta, unletterbox } from './yoloDecode';
import type { DetectionLabel } from './types';
import type { YoloRequest, YoloResponse } from './yoloWorkerProtocol';

/** `fetch` qui refuse le HTML de repli : en dev, Vite renvoie `index.html` en 200 pour un fichier absent de `public/`. */
async function fetchAsset(url: string): Promise<Response | null> {
  const res = await fetch(url);
  const type = res.headers.get('content-type') ?? '';
  return res.ok && !type.includes('text/html') ? res : null;
}

/**
 * Threads wasm du détecteur. Le multithread exige `crossOriginIsolated` (SharedArrayBuffer), fourni par
 * les en-têtes COOP/COEP du serveur Vite. Le nombre est **plafonné** : mesuré sur 24 cœurs logiques,
 * 23 threads étaient deux fois plus lents que 4 — la scène 3D et le rastériseur occupent déjà la
 * machine, et sur-souscrire fait perdre plus que le parallélisme ne rapporte (issue #36).
 */
export const MAX_WASM_THREADS = 8;

function threadCount(): number {
  if (!self.crossOriginIsolated) return 1;
  return Math.max(1, Math.min(MAX_WASM_THREADS, (navigator.hardwareConcurrency || 2) - 1));
}

let session: ort.InferenceSession | null = null;
let labels: DetectionLabel[] = [];
let inputName = '';
let outputName = '';

const post = (message: YoloResponse): void => {
  self.postMessage(message);
};

async function init(modelUrl: string, metaUrl: string): Promise<void> {
  const metaRes = await fetchAsset(metaUrl);
  if (!metaRes) return post({ type: 'unavailable', reason: 'fichier de classes absent' });
  const meta = parseModelMeta(await metaRes.json());
  if (!meta) return post({ type: 'unavailable', reason: 'fichier de classes invalide' });
  const modelRes = await fetchAsset(modelUrl);
  if (!modelRes) return post({ type: 'unavailable', reason: 'modèle absent' });
  ort.env.wasm.wasmPaths = { wasm: ortWasmUrl };
  ort.env.wasm.numThreads = threadCount();
  ort.env.wasm.simd = true;
  const created = await ort.InferenceSession.create(new Uint8Array(await modelRes.arrayBuffer()), { executionProviders: ['wasm'] });
  const input = created.inputNames[0];
  const output = created.outputNames[0];
  if (input === undefined || output === undefined) return post({ type: 'unavailable', reason: 'entrées/sorties inattendues' });
  session = created;
  labels = meta.names.map(labelFromName);
  inputName = input;
  outputName = output;
  post({ type: 'ready' });
}

async function run(id: number, width: number, height: number, data: ArrayBuffer): Promise<void> {
  if (session === null) return post({ type: 'failure', id, reason: 'session absente' });
  const lb = letterbox({ width, height, data: new Uint8ClampedArray(data) }, YOLO_INPUT_PX);
  const feeds = { [inputName]: new ort.Tensor('float32', lb.tensor, [1, 3, YOLO_INPUT_PX, YOLO_INPUT_PX]) };
  const out = (await session.run(feeds))[outputName];
  if (!out || !(out.data instanceof Float32Array)) return post({ type: 'result', id, detections: [] });
  const detections = nms(decodeYolo(out.data, out.dims, labels, YOLO_DECODE_SCORE_MIN), YOLO_IOU_THRESHOLD).map((d) => unletterbox(d, lb));
  post({ type: 'result', id, detections });
}

self.onmessage = (event: MessageEvent<YoloRequest>): void => {
  const message = event.data;
  const failed = (error: unknown): void => {
    const reason = error instanceof Error ? error.message : String(error);
    post(message.type === 'init' ? { type: 'unavailable', reason } : { type: 'failure', id: message.id, reason });
  };
  if (message.type === 'init') void init(message.modelUrl, message.metaUrl).catch(failed);
  else void run(message.id, message.width, message.height, message.data).catch(failed);
};
