import {
  BoxGeometry,
  BufferGeometry,
  Float32BufferAttribute,
  Group,
  LineBasicMaterial,
  LineSegments,
  Mesh,
  MeshBasicMaterial,
  OrthographicCamera,
  WebGLRenderTarget,
  type Scene,
  type WebGLRenderer,
} from 'three';
import { CAMERA_IDS, VIEW_SIZE_PX, vadd, vscale, type CameraId, type CameraPose, type Vec3 } from '@tomato/shared';
import { worldToThree } from '../three/frame';
import { AGENT_LAYER } from '../three/layers';
import { cameraBasis, type CameraBasis } from './ortho';
import { LINEAR_TO_SRGB_LUT, applyLutRgb, flipRowsRgba } from './pixels';

/** Issue #18 : les CameraHelper (frustums pleine longueur) traversaient toute la vue spectateur. */
const GIZMO_COLOR = '#9ca3af';
/** Corps de caméra : petite boîte discrète, face 6×6 cm, 4 cm de profondeur. */
const BODY_WIDTH_CM = 6;
const BODY_HEIGHT_CM = 6;
const BODY_DEPTH_CM = 4;
/** Tronçon de frustum : même largeur que le corps, 20 cm de profondeur vers la cible (pas toute la scène). */
const FRUSTUM_WIDTH_CM = BODY_WIDTH_CM;
const FRUSTUM_DEPTH_CM = 20;
/** Nom du groupe contenant tous les gizmos ; masqué par défaut, basculé par la touche « c » du dashboard. */
export const CAMERA_GIZMOS_GROUP_NAME = 'camera-gizmos';

export interface CameraGizmo {
  body: Mesh;
  frustum: LineSegments;
}

export interface AgentCamera {
  id: CameraId;
  camera: OrthographicCamera;
  target: WebGLRenderTarget;
  gizmo: CameraGizmo;
}

export type AgentCameras = Record<CameraId, AgentCamera>;

/** Plans de clipping en cm : la caméra la plus lointaine (top à z = 160) doit voir le sol. */
const NEAR_CM = 1;
const FAR_CM = 300;
/** Demi-largeur de champ initiale (100 cm de champ) ; poseCamera la remplace dès la première pose. */
const DEFAULT_HALF_WIDTH_CM = 50;

/**
 * Les 8 sommets d'un tronçon de frustum, appairés (proche, loin) prêts pour un `LineSegments` (4 arêtes).
 * Caméras orthographiques : les arêtes sont parallèles (pas de convergence) — chaque coin proche, dans le
 * plan `right`/`up` autour de `position`, est relié au coin lointain correspondant, `depthCm` plus loin le
 * long de `basis.forward`.
 */
export function frustumStubVertices(position: Vec3, basis: CameraBasis, widthCm: number, depthCm: number): Vec3[] {
  const half = widthCm / 2;
  const signs: ReadonlyArray<readonly [number, number]> = [
    [-1, 1],
    [1, 1],
    [1, -1],
    [-1, -1],
  ];
  const vertices: Vec3[] = [];
  for (const [sr, su] of signs) {
    const near = vadd(vadd(position, vscale(basis.right, sr * half)), vscale(basis.up, su * half));
    vertices.push(near, vadd(near, vscale(basis.forward, depthCm)));
  }
  return vertices;
}

function createGizmo(id: CameraId, group: Group): CameraGizmo {
  const body = new Mesh(
    new BoxGeometry(BODY_WIDTH_CM, BODY_HEIGHT_CM, BODY_DEPTH_CM),
    new MeshBasicMaterial({ color: GIZMO_COLOR, transparent: true, opacity: 0.9 }),
  );
  body.name = `camera-gizmo-body-${id}`;

  const frustumGeometry = new BufferGeometry();
  frustumGeometry.setAttribute('position', new Float32BufferAttribute(new Float32Array(8 * 3), 3));
  const frustum = new LineSegments(
    frustumGeometry,
    new LineBasicMaterial({ color: GIZMO_COLOR, transparent: true, opacity: 0.35, depthWrite: false }),
  );
  frustum.name = `camera-gizmo-frustum-${id}`;

  group.add(body, frustum);
  return { body, frustum };
}

/** Repositionne le corps (position + orientation `cameraBasis`) et redessine le tronçon de frustum vers la cible. */
function updateGizmo(gizmo: CameraGizmo, pose: CameraPose, basis: CameraBasis): void {
  gizmo.body.position.copy(worldToThree(pose.positionCm));
  gizmo.body.up.copy(worldToThree(basis.up));
  gizmo.body.lookAt(worldToThree(vadd(pose.positionCm, basis.forward)));

  const vertices = frustumStubVertices(pose.positionCm, basis, FRUSTUM_WIDTH_CM, FRUSTUM_DEPTH_CM);
  const positions = gizmo.frustum.geometry.getAttribute('position');
  vertices.forEach((v, i) => {
    const p = worldToThree(v);
    positions.setXYZ(i, p.x, p.y, p.z);
  });
  positions.needsUpdate = true;
  gizmo.frustum.geometry.computeBoundingSphere();
}

/** Montre/masque un gizmo (corps + tronçon) sans toucher au groupe : utilisé pour l'exclure d'un rendu agent. */
export function setGizmoVisible(cam: AgentCamera, visible: boolean): void {
  cam.gizmo.body.visible = visible;
  cam.gizmo.frustum.visible = visible;
}

/** Dernier groupe de gizmos créé (une scène à la fois en pratique) ; bascule par `setCameraGizmosVisible`. */
let currentGizmoGroup: Group | null = null;

function createOne(id: CameraId, group: Group): AgentCamera {
  const half = DEFAULT_HALF_WIDTH_CM;
  const camera = new OrthographicCamera(-half, half, half, -half, NEAR_CM, FAR_CM);
  // Schéma des lames réservé à l'agent : les vues et la passe d'identifiants ne bougent pas (layers.ts).
  camera.layers.enable(AGENT_LAYER);
  camera.name = `agent-camera-${id}`;
  const target = new WebGLRenderTarget(VIEW_SIZE_PX, VIEW_SIZE_PX, { depthBuffer: true, stencilBuffer: false });
  const gizmo = createGizmo(id, group);
  return { id, camera, target, gizmo };
}

/** Trois caméras orthographiques 800×800 ; leurs gizmos (corps + tronçon de frustum) sont groupés, masqués par défaut. */
export function createAgentCameras(scene: Scene): AgentCameras {
  const group = new Group();
  group.name = CAMERA_GIZMOS_GROUP_NAME;
  group.visible = false;
  scene.add(group);
  currentGizmoGroup = group;
  return { top: createOne('top', group), front: createOne('front', group), side: createOne('side', group) };
}

/** Affiche/masque le groupe `camera-gizmos` de la dernière scène créée (touche « c » du dashboard). */
export function setCameraGizmosVisible(visible: boolean): void {
  if (currentGizmoGroup) currentGizmoGroup.visible = visible;
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
  updateGizmo(cam.gizmo, pose, b);
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
