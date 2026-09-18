import type { Detection, RipeDetector } from './types';
import type { YoloRequest, YoloResponse } from './yoloWorkerProtocol';

/** Fichiers produits par `scripts/export-yolo.py` puis `scripts/perception/finetune.py` dans `packages/sim/public/models/`. */
export const YOLO_MODEL_URL = '/models/tomato-ripe.onnx';
export const YOLO_META_URL = '/models/tomato-ripe.json';
/** Au-delà, on considère le worker perdu et on repasse définitivement sur HSV. */
export const YOLO_LOAD_TIMEOUT_MS = 60_000;
export const YOLO_FRAME_TIMEOUT_MS = 10_000;

function unavailable(reason: string): null {
  console.info(`[perception] YOLO désactivé (${reason}) : détecteur HSV seul`);
  return null;
}

/** Une attente en cours, résolue par le message `result` de même identifiant. */
interface Pending {
  resolve: (detections: Detection[]) => void;
  reject: (error: Error) => void;
  timer: ReturnType<typeof setTimeout>;
}

/** Ce que le chargeur attend d'un worker ; un vrai `Worker` s'y conforme, et les tests passent un faux. */
export interface YoloWorkerLike {
  postMessage(message: YoloRequest, transfer?: Transferable[]): void;
  terminate(): void;
  onmessage: ((event: MessageEvent<YoloResponse>) => void) | null;
}

function createWorker(): YoloWorkerLike {
  return new Worker(new URL('./yoloWorker.ts', import.meta.url), { type: 'module' });
}

/**
 * Charge le modèle YOLOv8 ripe/unripe **dans un worker** : l'inférence wasm dure environ 350 ms par image
 * et gelait la scène Three.js à chaque tick quand elle tournait sur le fil principal (issue #36). Renvoie
 * null, jamais d'exception, si le modèle, ses classes ou le runtime manquent : la perception continue
 * avec HSV (spec 10, coupe n° 1).
 */
export async function loadYoloDetector(
  modelUrl: string = YOLO_MODEL_URL,
  metaUrl: string = YOLO_META_URL,
  spawn: () => YoloWorkerLike = createWorker,
): Promise<RipeDetector | null> {
  let worker: YoloWorkerLike;
  try {
    worker = spawn();
  } catch (error) {
    console.warn('[perception] worker YOLO indisponible, détecteur HSV seul', error);
    return null;
  }
  const pending = new Map<number, Pending>();
  let nextId = 1;
  let ready: ((value: boolean) => void) | null = null;

  worker.onmessage = (event: MessageEvent<YoloResponse>): void => {
    const message = event.data;
    if (message.type === 'ready' || message.type === 'unavailable') {
      if (message.type === 'unavailable') unavailable(message.reason);
      ready?.(message.type === 'ready');
      ready = null;
      return;
    }
    const waiting = pending.get(message.id);
    if (waiting === undefined) return;
    pending.delete(message.id);
    clearTimeout(waiting.timer);
    if (message.type === 'result') waiting.resolve(message.detections);
    else waiting.reject(new Error(message.reason));
  };

  const post = (request: YoloRequest, transfer: Transferable[] = []): void => worker.postMessage(request, transfer);
  const started = new Promise<boolean>((resolve) => {
    const timer = setTimeout(() => {
      ready = null;
      unavailable('chargement trop long');
      resolve(false);
    }, YOLO_LOAD_TIMEOUT_MS);
    ready = (value) => {
      clearTimeout(timer);
      resolve(value);
    };
  });
  post({ type: 'init', modelUrl, metaUrl });
  if (!(await started)) {
    worker.terminate();
    return null;
  }

  return (img) => {
    const id = nextId++;
    // Copie détachable : le tampon d'origine appartient au module de perception, qui le réaffiche.
    const data = new Uint8ClampedArray(img.data).buffer;
    return new Promise<Detection[]>((resolve, reject) => {
      const timer = setTimeout(() => {
        pending.delete(id);
        reject(new Error('inférence sans réponse'));
      }, YOLO_FRAME_TIMEOUT_MS);
      pending.set(id, { resolve, reject, timer });
      post({ type: 'frame', id, width: img.width, height: img.height, data }, [data]);
    });
  };
}
