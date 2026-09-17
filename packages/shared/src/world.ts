import type { Phase } from './phases';
import type { Vec2, Vec3 } from './units';

export const CAMERA_IDS = ['top', 'front', 'side'] as const;
export type CameraId = (typeof CAMERA_IDS)[number];

export type TomatoState = 'unripe' | 'turning' | 'ripe';

export interface Tomato {
  id: number;
  state: TomatoState;
  /** 0 = vert, 1 = mûr. */
  ripeness: number;
  positionCm: Vec3;
  radiusCm: number;
  /** Pédoncule : de la branche (from) vers le fruit (to). */
  stem: { fromCm: Vec3; toCm: Vec3 };
  /** false une fois coupée. */
  attached: boolean;
  /** Fraction visible (0..1) dans chaque vue, estimée par la sim. */
  visibleIn: Record<CameraId, number>;
}

export interface CameraPose {
  positionCm: Vec3;
  yawDeg: number;
  tiltDeg: number;
  /** Largeur du champ orthographique, en cm. */
  widthCm: number;
  /** Dérivé : VIEW_SIZE_PX / widthCm. */
  pxPerCm: number;
}

export interface ScissorsPose {
  cutPointCm: Vec3;
  yawDeg: number;
  pitchDeg: number;
  rollDeg: number;
  /** 0 = fermés. */
  openingDeg: number;
  bladeAxis: Vec3;
  bladeNormal: Vec3;
}

export interface BasketPose {
  centerCm: Vec3;
  sizeCm: Vec2;
  depthCm: number;
}

export interface Range {
  x: Vec2;
  y: Vec2;
  z: Vec2;
}

export interface Limits {
  scissorsBaseCm: Vec3;
  scissorsReachCm: number;
  basketRailCm: { x: Vec2; y: Vec2 };
  cameraRailsCm: Record<CameraId, Range>;
  cameraPivotDeg: number;
}

export interface WorldState {
  seed: number;
  simTimeS: number;
  timeScale: number;
  paused: boolean;
  phase: Phase;
  targetTomatoId: number | null;
  tomatoes: Tomato[];
  scissors: ScissorsPose;
  basket: BasketPose;
  cameras: Record<CameraId, CameraPose>;
  limits: Limits;
}

export const VIEW_SIZE_PX = 800;

export const DEFAULT_LIMITS: Limits = {
  scissorsBaseCm: [70, -40, 0],
  scissorsReachCm: 110,
  basketRailCm: { x: [-40, 40], y: [-40, 40] },
  cameraRailsCm: {
    top: { x: [-40, 40], y: [-40, 40], z: [90, 160] },
    front: { x: [-40, 40], y: [-160, -70], z: [10, 100] },
    side: { x: [70, 160], y: [-40, 40], z: [10, 100] },
  },
  cameraPivotDeg: 25,
};

function camera(positionCm: Vec3, widthCm: number): CameraPose {
  return { positionCm, yawDeg: 0, tiltDeg: 0, widthCm, pxPerCm: VIEW_SIZE_PX / widthCm };
}

export function createDefaultWorld(seed: number): WorldState {
  return {
    seed,
    simTimeS: 0,
    timeScale: 1,
    paused: false,
    phase: 'idle',
    targetTomatoId: null,
    tomatoes: [],
    scissors: {
      cutPointCm: [45, -35, 60],
      yawDeg: 0,
      pitchDeg: 0,
      rollDeg: 0,
      openingDeg: 0,
      bladeAxis: [-1, 0, 0],
      bladeNormal: [0, 0, 1],
    },
    basket: { centerCm: [0, 0, 5], sizeCm: [20, 20], depthCm: 10 },
    cameras: {
      top: camera([0, 0, 120], 100),
      front: camera([0, -100, 45], 100),
      side: camera([100, 0, 45], 100),
    },
    limits: DEFAULT_LIMITS,
  };
}
