import * as ort from 'onnxruntime-web/wasm';
import ortWasmUrl from 'onnxruntime-web/ort-wasm-simd-threaded.wasm?url';
import type { RipeDetector } from './types';
import { YOLO_DECODE_SCORE_MIN, YOLO_INPUT_PX, YOLO_IOU_THRESHOLD, decodeYolo, labelFromName, letterbox, nms, parseModelMeta, unletterbox } from './yoloDecode';

/** Fichiers produits par `scripts/export-yolo.py` dans `packages/sim/public/models/` (le .onnx n'est pas versionné). */
export const YOLO_MODEL_URL = '/models/tomato-ripe.onnx';
export const YOLO_META_URL = '/models/tomato-ripe.json';

/** `fetch` qui refuse le HTML de repli : en dev, Vite renvoie `index.html` en 200 pour un fichier absent de `public/`. */
async function fetchAsset(url: string): Promise<Response | null> {
  const res = await fetch(url);
  const type = res.headers.get('content-type') ?? '';
  return res.ok && !type.includes('text/html') ? res : null;
}

function unavailable(reason: string): null {
  console.info(`[perception] YOLO désactivé (${reason}) : détecteur HSV seul`);
  return null;
}

/**
 * Charge le modèle YOLOv8 ripe/unripe avec onnxruntime-web (backend wasm, un seul thread : le multi-thread exige
 * un contexte cross-origin isolated que Vite ne fournit pas). Renvoie null, jamais d'exception, si le modèle,
 * ses classes ou le runtime manquent : la perception continue avec HSV (spec 10, coupe n° 1).
 */
export async function loadYoloDetector(modelUrl: string = YOLO_MODEL_URL, metaUrl: string = YOLO_META_URL): Promise<RipeDetector | null> {
  try {
    const metaRes = await fetchAsset(metaUrl);
    if (!metaRes) return unavailable('fichier de classes absent');
    const meta = parseModelMeta(await metaRes.json());
    if (!meta) return unavailable('fichier de classes invalide');
    const modelRes = await fetchAsset(modelUrl);
    if (!modelRes) return unavailable('modèle absent');
    ort.env.wasm.wasmPaths = { wasm: ortWasmUrl };
    ort.env.wasm.numThreads = 1;
    const session = await ort.InferenceSession.create(new Uint8Array(await modelRes.arrayBuffer()), { executionProviders: ['wasm'] });
    const inputName = session.inputNames[0];
    const outputName = session.outputNames[0];
    if (inputName === undefined || outputName === undefined) return unavailable('entrées/sorties inattendues');
    const labels = meta.names.map(labelFromName);
    return async (img) => {
      const lb = letterbox(img, YOLO_INPUT_PX);
      const feeds = { [inputName]: new ort.Tensor('float32', lb.tensor, [1, 3, YOLO_INPUT_PX, YOLO_INPUT_PX]) };
      const output = (await session.run(feeds))[outputName];
      if (!output || !(output.data instanceof Float32Array)) return [];
      return nms(decodeYolo(output.data, output.dims, labels, YOLO_DECODE_SCORE_MIN), YOLO_IOU_THRESHOLD).map((d) => unletterbox(d, lb));
    };
  } catch (error) {
    console.warn('[perception] YOLO indisponible, détecteur HSV seul', error);
    return null;
  }
}
