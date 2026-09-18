import { CAMERA_IDS, type CameraId, type ViewsResult, type WorldState } from '@tomato/shared';
import type { SimModule } from '../core/module';
import type { SceneHandle } from '../three/createScene';
import { createAgentCameras, poseAllCameras, renderToImageData, setGizmoVisible, type AgentCameras } from './agentCameras';
import { moveCamera } from './cameraState';
import { createViewRenderer } from './renderViews';

export type RenderViewsFn = (cameras: CameraId[]) => Promise<ViewsResult>;

let renderViewsFn: RenderViewsFn | null = null;
let cams: AgentCameras | null = null;
/** Caméras par scène : la page peut monter deux scènes (StrictMode) ; chaque runtime capture la sienne. */
const camerasByScene = new WeakMap<SceneHandle, AgentCameras>();
let lastPoses: WorldState['cameras'] | null = null;
const viewListeners = new Set<(result: ViewsResult) => void>();

/** La fonction `renderViews` du module, disponible après `init` avec une scène ; null en Node. */
export function getRenderViews(): RenderViewsFn | null {
  return renderViewsFn;
}

/** M4 : image brute (sRGB, 800×800) d'une caméra de la scène donnée, helpers masqués, sans annotation ; null sans scène. */
export function renderCameraImage(scene: SceneHandle, camId: CameraId): ImageData | null {
  const owned = camerasByScene.get(scene);
  if (!owned) return null;
  for (const id of CAMERA_IDS) setGizmoVisible(owned[id], false);
  try {
    return renderToImageData(scene.renderer, scene.scene, owned[camId]);
  } finally {
    for (const id of CAMERA_IDS) setGizmoVisible(owned[id], true);
  }
}

/** Abonne un composant aux résultats de chaque `renderViews` (AgentViews). */
export function subscribeViews(fn: (result: ViewsResult) => void): () => void {
  viewListeners.add(fn);
  return () => viewListeners.delete(fn);
}

/** M3 : caméras orthographiques, action move_camera, vues annotées. Écrit `cameras` et `tomatoes[i].visibleIn`. */
export const cameraModule: SimModule = {
  name: 'cameras',
  init(ctx) {
    if (!ctx.scene) return;
    const created = createAgentCameras(ctx.scene.scene);
    cams = created;
    camerasByScene.set(ctx.scene, created);
    lastPoses = ctx.store.get().cameras;
    poseAllCameras(created, lastPoses);
    const render = createViewRenderer(ctx, ctx.scene, created);
    renderViewsFn = async (cameras) => {
      const result = await render(cameras);
      for (const fn of viewListeners) fn(result);
      return result;
    };
  },
  update(_dtSimS, ctx) {
    if (!cams) return;
    const poses = ctx.store.get().cameras;
    if (poses === lastPoses) return;
    lastPoses = poses;
    poseAllCameras(cams, poses);
  },
  handle(action, ctx) {
    if (action.type !== 'move_camera') return null;
    const result = moveCamera(ctx.store.get(), action);
    if (result.ok) ctx.store.set(result.state);
    return result;
  },
};
