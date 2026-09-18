import { CAMERA_IDS, VIEW_SIZE_PX, type CameraId, type ViewsResult, type WorldState } from '@tomato/shared';
import { createMotionRunner, type Motion } from '../core/animate';
import { createAngleTween, createLane, createTimedTween, createTween, type Lane } from '../core/animation';
import type { SimModule } from '../core/module';
import { CAMERA_PIVOT_SPEED_DEG_S, CAMERA_SPEED_CM_S, CAMERA_ZOOM_DURATION_S } from '../core/speeds';
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
const motions = createMotionRunner();
/** Une file par caméra : un `move_camera` attend la fin du précédent sur la MÊME caméra. */
const lanes: Record<CameraId, Lane> = { top: createLane(), front: createLane(), side: createLane() };

/** Caméra : translation à 20 cm/s, pivot à 45°/s, changement de champ en 0,5 s. */
function cameraMotion(id: CameraId): (from: WorldState, to: WorldState) => Motion {
  return (from, to) => {
    const a = from.cameras[id];
    const b = to.cameras[id];
    const position = createTween(a.positionCm, b.positionCm, CAMERA_SPEED_CM_S);
    const yaw = createAngleTween(a.yawDeg, b.yawDeg, CAMERA_PIVOT_SPEED_DEG_S);
    const tilt = createAngleTween(a.tiltDeg, b.tiltDeg, CAMERA_PIVOT_SPEED_DEG_S);
    const width = createTimedTween(a.widthCm, b.widthCm, a.widthCm === b.widthCm ? 0 : CAMERA_ZOOM_DURATION_S);
    return {
      step(dtSimS, current) {
        const positionCm = position.step(dtSimS);
        const yawDeg = yaw.step(dtSimS);
        const tiltDeg = tilt.step(dtSimS);
        const widthCm = width.step(dtSimS);
        const done = position.done && yaw.done && tilt.done && width.done;
        const pose = done ? b : { positionCm, yawDeg, tiltDeg, widthCm, pxPerCm: VIEW_SIZE_PX / widthCm };
        return { state: { ...current, cameras: { ...current.cameras, [id]: pose } }, done };
      },
    };
  };
}

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
  update(dtSimS, ctx) {
    motions.update(dtSimS, ctx);
    if (!cams) return;
    const poses = ctx.store.get().cameras;
    if (poses === lastPoses) return;
    lastPoses = poses;
    poseAllCameras(cams, poses);
  },
  handle(action, ctx, opts) {
    if (action.type !== 'move_camera') return null;
    const spec = { compute: (s: WorldState) => moveCamera(s, action), motion: cameraMotion(action.camera) };
    return opts?.instant === true ? motions.now(ctx, spec) : motions.start(ctx, lanes[action.camera], spec);
  },
};
