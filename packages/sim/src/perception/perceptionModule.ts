import type { CameraId, SimEvent } from '@tomato/shared';
import { renderCameraImage } from '../cameras/cameraModule';
import { setEdgeFilter } from '../cameras/renderViews';
import type { SimContext, SimModule } from '../core/module';
import { createCannyClaheFilter, loadOpenCv, type CvApi } from './cannyClahe';
import { hsvDetector } from './hsvDetector';
import { createPerceptionModule } from './perceptionRuntime';
import { capturePipeline, type PipelineCapture } from './pipelineCapture';
import { resizeRgba } from './rgba';
import { DETECTOR_INPUT_PX, type PerceptionState } from './types';
import { loadYoloDetector } from './yoloDetector';

declare global {
  interface Window {
    /** Exposé pour Playwright (`tests/perception.spec.ts`). */
    __tomatoPerception?: { state: () => PerceptionState; events: SimEvent[] };
  }
}

/** OpenCV.js une fois chargé : le mode pipeline réutilise la même instance que le filtre de contours. */
let cvApi: CvApi | null = null;

const runtime = createPerceptionModule({
  captureFront: (ctx) => {
    const img = ctx.scene ? renderCameraImage(ctx.scene, 'front') : null;
    return img ? resizeRgba(img, DETECTOR_INPUT_PX, DETECTOR_INPUT_PX) : null;
  },
  hsv: hsvDetector,
  loadYolo: () => loadYoloDetector(),
  loadEdgeFilter: async () => {
    const cv = await loadOpenCv();
    cvApi = cv;
    return cv ? createCannyClaheFilter(cv) : null;
  },
  setEdgeFilter,
});

/** M4 : contours Canny + CLAHE, détecteur mûr YOLO/HSV à 2 Hz sim, réveil `ripe_detected`. Après `cameraModule` dans MODULES. */
export const perceptionModule: SimModule = runtime;

/** État pour le dashboard : détecteur actif, disponibilité d'OpenCV et de YOLO, dernières boîtes, frame d'entrée. */
export const perceptionState = runtime.state;
export const subscribePerception = runtime.subscribe;

/**
 * Mode « Pipeline de traitement » (issue #36, touche `x`) : rejoue la chaîne complète sur une caméra et
 * renvoie chaque tampon intermédiaire réel. Null sans scène (page en lecture seule, tests Node).
 */
export async function capturePerceptionPipeline(camera: CameraId, ctx: SimContext): Promise<PipelineCapture | null> {
  if (!ctx.scene) return null;
  return capturePipeline(camera, { scene: ctx.scene, world: ctx.store.get(), cv: cvApi, analyze: runtime.analyze });
}

if (typeof window !== 'undefined') window.__tomatoPerception = { state: runtime.state, events: [] };
