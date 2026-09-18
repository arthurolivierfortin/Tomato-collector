import type { SimEvent } from '@tomato/shared';
import { renderCameraImage } from '../cameras/cameraModule';
import { setEdgeFilter } from '../cameras/renderViews';
import type { SimModule } from '../core/module';
import { createCannyClaheFilter, loadOpenCv } from './cannyClahe';
import { hsvDetector } from './hsvDetector';
import { createPerceptionModule } from './perceptionRuntime';
import { resizeRgba } from './rgba';
import { DETECTOR_INPUT_PX, type PerceptionState } from './types';
import { loadYoloDetector } from './yoloDetector';

declare global {
  interface Window {
    /** Exposé pour Playwright (`tests/perception.spec.ts`). */
    __tomatoPerception?: { state: () => PerceptionState; events: SimEvent[] };
  }
}

const runtime = createPerceptionModule({
  captureFront: (ctx) => {
    const img = ctx.scene ? renderCameraImage(ctx.scene, 'front') : null;
    return img ? resizeRgba(img, DETECTOR_INPUT_PX, DETECTOR_INPUT_PX) : null;
  },
  hsv: hsvDetector,
  loadYolo: () => loadYoloDetector(),
  loadEdgeFilter: async () => {
    const cv = await loadOpenCv();
    return cv ? createCannyClaheFilter(cv) : null;
  },
  setEdgeFilter,
});

/** M4 : contours Canny + CLAHE, détecteur mûr YOLO/HSV à 2 Hz sim, réveil `ripe_detected`. Après `cameraModule` dans MODULES. */
export const perceptionModule: SimModule = runtime;

/** État pour le dashboard : détecteur actif, disponibilité d'OpenCV et de YOLO, dernières boîtes. */
export const perceptionState = runtime.state;
export const subscribePerception = runtime.subscribe;

if (typeof window !== 'undefined') window.__tomatoPerception = { state: runtime.state, events: [] };
