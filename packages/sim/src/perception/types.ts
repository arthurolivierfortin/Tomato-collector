import type { DetectorKind } from '@tomato/shared';

/** Image RGBA structurelle : `ImageData` du navigateur, ou tampon nu dans les tests Node. */
export interface RgbaImage {
  readonly width: number;
  readonly height: number;
  readonly data: Uint8ClampedArray;
}

export type DetectionLabel = 'ripe' | 'unripe';

/** Boîte [x, y, w, h] en pixels de l'image analysée ; score 0..1. */
export interface Detection {
  bbox: readonly [number, number, number, number];
  score: number;
  label: DetectionLabel;
}

/**
 * Un détecteur de tomates mûres. Synchrone (HSV) ou asynchrone (YOLO : `InferenceSession.run` de
 * onnxruntime-web renvoie une Promise), d'où l'union.
 */
export type RipeDetector = (img: RgbaImage) => Detection[] | Promise<Detection[]>;

/** État exposé au dashboard (`perceptionState()`). */
export interface PerceptionState {
  opencvReady: boolean;
  yoloReady: boolean;
  lastDetector: DetectorKind | null;
  lastDetections: Detection[];
}

/** Côté de l'image carrée fournie aux détecteurs (spec 4.4 : vue front réduite à 640 px). */
export const DETECTOR_INPUT_PX = 640;
