import type { Phase } from './phases';
import type { Vec3 } from './units';
import type { BasketPose, CameraId, CameraPose, Limits, ScissorsPose, TomatoState } from './world';

export interface ViewImage {
  camera: CameraId;
  /** PNG encodé en base64, sans préfixe data:. */
  pngBase64: string;
  widthPx: number;
  heightPx: number;
}

export interface TomatoView {
  id: number;
  state: TomatoState;
  ripeness: number;
  positionCm: Vec3;
  stem: { fromCm: Vec3; toCm: Vec3 };
  visibleIn: Record<CameraId, number>;
}

/** Le JSON qui accompagne les images (spec section 4.5). */
export interface ViewsPayload {
  simTimeS: number;
  phase: Phase;
  targetTomatoId: number | null;
  tomatoes: TomatoView[];
  scissors: ScissorsPose;
  basket: BasketPose;
  cameras: Record<CameraId, CameraPose>;
  limits: Limits;
}

export interface ViewsResult {
  images: ViewImage[];
  json: ViewsPayload;
}
