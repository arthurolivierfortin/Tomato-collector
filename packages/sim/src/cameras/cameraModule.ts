import type { CameraId, ViewsResult, WorldState } from '@tomato/shared';
import type { SimModule } from '../core/module';
import { moveCamera } from './cameraState';

export type RenderViewsFn = (cameras: CameraId[]) => Promise<ViewsResult>;

let lastPoses: WorldState['cameras'] | null = null;

/** La fonction `renderViews` du module, disponible après `init` avec une scène ; null en Node. Branchée en Task 8. */
export function getRenderViews(): RenderViewsFn | null {
  return null;
}

export const cameraModule: SimModule = {
  name: 'cameras',
  init(ctx) {
    if (!ctx.scene) return;
    lastPoses = ctx.store.get().cameras; // Task 8 ajoute ici la création des caméras Three et de renderViews
  },
  update(_dtSimS, ctx) {
    if (!ctx.scene) return;
    const poses = ctx.store.get().cameras;
    if (poses === lastPoses) return;
    lastPoses = poses;
  },
  handle(action, ctx) {
    if (action.type !== 'move_camera') return null;
    const result = moveCamera(ctx.store.get(), action);
    if (result.ok) ctx.store.set(result.state);
    return result;
  },
};
