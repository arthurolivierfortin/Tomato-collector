import type { CameraId, ViewsResult, WorldState } from '@tomato/shared';
import type { SimModule } from '../core/module';
import { createAgentCameras, poseAllCameras, type AgentCameras } from './agentCameras';
import { moveCamera } from './cameraState';
import { createViewRenderer } from './renderViews';

export type RenderViewsFn = (cameras: CameraId[]) => Promise<ViewsResult>;

let renderViewsFn: RenderViewsFn | null = null;
let cams: AgentCameras | null = null;
let lastPoses: WorldState['cameras'] | null = null;
const viewListeners = new Set<(result: ViewsResult) => void>();

/** La fonction `renderViews` du module, disponible après `init` avec une scène ; null en Node. */
export function getRenderViews(): RenderViewsFn | null {
  return renderViewsFn;
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
