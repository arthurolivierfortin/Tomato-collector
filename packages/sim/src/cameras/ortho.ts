import { VIEW_SIZE_PX, degToRad, vadd, vdot, vscale, vsub, type CameraId, type CameraPose, type Vec2, type Vec3 } from '@tomato/shared';

export type WorldAxis = 'X' | 'Y' | 'Z';

/** Base orthonormée d'une caméra, en repère monde (cm). right × up = −forward. */
export interface CameraBasis {
  forward: Vec3;
  right: Vec3;
  up: Vec3;
}

/** Axes monde portés par l'image (spec 4.3) ; les signes disent dans quel sens ils croissent (droite, haut). */
export interface ImageAxes {
  horizontal: WorldAxis;
  vertical: WorldAxis;
  horizontalSign: 1 | -1;
  verticalSign: 1 | -1;
}

/** Hauteur de référence du poste de travail (centre du plant) : profondeur du plan de grille de la caméra top. */
export const FOCUS_HEIGHT_CM = 45;

const WORLD_Z: Vec3 = [0, 0, 1];

/** Bases nominales (lacet = tangage = 0) : top regarde −Z, front +Y, side −X. */
const NOMINAL_BASES: Record<CameraId, CameraBasis> = {
  top: { forward: [0, 0, -1], right: [1, 0, 0], up: [0, 1, 0] },
  front: { forward: [0, 1, 0], right: [1, 0, 0], up: [0, 0, 1] },
  side: { forward: [-1, 0, 0], right: [0, 1, 0], up: [0, 0, 1] },
};

const IMAGE_AXES: Record<CameraId, ImageAxes> = {
  top: { horizontal: 'X', vertical: 'Y', horizontalSign: 1, verticalSign: 1 },
  front: { horizontal: 'X', vertical: 'Z', horizontalSign: 1, verticalSign: 1 },
  side: { horizontal: 'Y', vertical: 'Z', horizontalSign: 1, verticalSign: 1 },
};

export const vcross = (a: Vec3, b: Vec3): Vec3 => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];

/** Rotation de Rodrigues de v autour de l'axe unitaire k, angle en degrés, règle de la main droite. */
export function rotateAroundAxis(v: Vec3, k: Vec3, deg: number): Vec3 {
  const t = degToRad(deg);
  const c = Math.cos(t);
  const s = Math.sin(t);
  return vadd(vadd(vscale(v, c), vscale(vcross(k, v), s)), vscale(k, vdot(k, v) * (1 - c)));
}

/** Base nominale, puis lacet autour de Z monde, puis tangage autour de l'axe « droite » obtenu. */
export function cameraBasis(camId: CameraId, pose: CameraPose): CameraBasis {
  const n = NOMINAL_BASES[camId];
  const right = rotateAroundAxis(n.right, WORLD_Z, pose.yawDeg);
  const forwardYawed = rotateAroundAxis(n.forward, WORLD_Z, pose.yawDeg);
  const upYawed = rotateAroundAxis(n.up, WORLD_Z, pose.yawDeg);
  return {
    forward: rotateAroundAxis(forwardYawed, right, pose.tiltDeg),
    right,
    up: rotateAroundAxis(upYawed, right, pose.tiltDeg),
  };
}

/** Facteur d'échelle dérivé de la largeur de champ (VIEW_SIZE_PX / widthCm). */
export const pxPerCmOf = (pose: CameraPose): number => VIEW_SIZE_PX / pose.widthCm;

/** Point monde → pixel d'une image 800×800 centrée sur l'axe de la caméra ; py croît vers le bas. */
export function projectToPixel(camId: CameraId, pose: CameraPose, pointCm: Vec3): Vec2 {
  const b = cameraBasis(camId, pose);
  const d = vsub(pointCm, pose.positionCm);
  const k = pxPerCmOf(pose);
  const half = VIEW_SIZE_PX / 2;
  return [half + vdot(d, b.right) * k, half - vdot(d, b.up) * k];
}

export function imageAxes(camId: CameraId): ImageAxes {
  return IMAGE_AXES[camId];
}

/** Point visé : position de la caméra ramenée sur le plan de grille (y = 0 front, x = 0 side, z = FOCUS_HEIGHT_CM top). */
export function gridPlanePoint(camId: CameraId, pose: CameraPose): Vec3 {
  const [x, y, z] = pose.positionCm;
  switch (camId) {
    case 'top':
      return [x, y, FOCUS_HEIGHT_CM];
    case 'front':
      return [x, 0, z];
    case 'side':
      return [0, y, z];
  }
}
