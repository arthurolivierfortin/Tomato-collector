import { CameraHelper, OrthographicCamera, WebGLRenderTarget, type Scene, type WebGLRenderer } from 'three';
import { CAMERA_IDS, VIEW_SIZE_PX, vadd, type CameraId, type CameraPose } from '@tomato/shared';
import { worldToThree } from '../three/frame';
import { cameraBasis } from './ortho';
import { LINEAR_TO_SRGB_LUT, applyLutRgb, flipRowsRgba } from './pixels';

export interface AgentCamera {
  id: CameraId;
  camera: OrthographicCamera;
  target: WebGLRenderTarget;
  helper: CameraHelper;
}

export type AgentCameras = Record<CameraId, AgentCamera>;

/** Plans de clipping en cm : la caméra la plus lointaine (top à z = 160) doit voir le sol. */
const NEAR_CM = 1;
const FAR_CM = 300;
/** Demi-largeur de champ initiale (100 cm de champ) ; poseCamera la remplace dès la première pose. */
const DEFAULT_HALF_WIDTH_CM = 50;

function createOne(id: CameraId, scene: Scene): AgentCamera {
  const half = DEFAULT_HALF_WIDTH_CM;
  const camera = new OrthographicCamera(-half, half, half, -half, NEAR_CM, FAR_CM);
  camera.name = `agent-camera-${id}`;
  const target = new WebGLRenderTarget(VIEW_SIZE_PX, VIEW_SIZE_PX, { depthBuffer: true, stencilBuffer: false });
  const helper = new CameraHelper(camera);
  helper.name = `agent-camera-helper-${id}`;
  scene.add(helper);
  return { id, camera, target, helper };
}

/** Trois caméras orthographiques 800×800 et leurs frustums dessinés dans la scène spectateur. */
export function createAgentCameras(scene: Scene): AgentCameras {
  return { top: createOne('top', scene), front: createOne('front', scene), side: createOne('side', scene) };
}

/** Applique une pose du store : champ = widthCm, position, orientation par la base monde convertie en Three. */
export function poseCamera(cam: AgentCamera, pose: CameraPose): void {
  const b = cameraBasis(cam.id, pose);
  const half = pose.widthCm / 2;
  cam.camera.left = -half;
  cam.camera.right = half;
  cam.camera.top = half;
  cam.camera.bottom = -half;
  cam.camera.updateProjectionMatrix();
  cam.camera.position.copy(worldToThree(pose.positionCm));
  cam.camera.up.copy(worldToThree(b.up));
  cam.camera.lookAt(worldToThree(vadd(pose.positionCm, b.forward)));
  cam.camera.updateMatrixWorld(true);
  cam.helper.update();
}

export function poseAllCameras(cams: AgentCameras, poses: Record<CameraId, CameraPose>): void {
  for (const id of CAMERA_IDS) poseCamera(cams[id], poses[id]);
}

/** Lit le render target d'une caméra en RGBA de bas en haut (sémantique gl.readPixels). */
export function readTargetPixels(renderer: WebGLRenderer, scene: Scene, cam: AgentCamera): Uint8Array {
  const size = VIEW_SIZE_PX;
  const buffer = new Uint8Array(size * size * 4);
  const previous = renderer.getRenderTarget();
  renderer.setRenderTarget(cam.target);
  renderer.render(scene, cam.camera);
  renderer.readRenderTargetPixels(cam.target, 0, 0, size, size, buffer);
  renderer.setRenderTarget(previous);
  return buffer;
}

/** Rendu d'une caméra en ImageData (lignes de haut en bas, converti de linéaire en sRGB). */
export function renderToImageData(renderer: WebGLRenderer, scene: Scene, cam: AgentCamera): ImageData {
  const data = flipRowsRgba(readTargetPixels(renderer, scene, cam), VIEW_SIZE_PX, VIEW_SIZE_PX);
  applyLutRgb(data, LINEAR_TO_SRGB_LUT);
  return new ImageData(data, VIEW_SIZE_PX, VIEW_SIZE_PX);
}
