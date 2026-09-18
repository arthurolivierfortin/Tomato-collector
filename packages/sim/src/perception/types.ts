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

/** Où en est la porte de réveil : « 3/5 frames consécutives » pour le panneau Perception (issue #36). */
export interface GateProgress {
  /** Tomate suivie par la porte au dernier tick ; null quand rien n'est détecté. */
  tomatoId: number | null;
  count: number;
  target: number;
}

/** État exposé au dashboard (`perceptionState()`). */
export interface PerceptionState {
  opencvReady: boolean;
  yoloReady: boolean;
  lastDetector: DetectorKind | null;
  lastDetections: Detection[];
  /** Image exactement telle que reçue par le détecteur au dernier tick (entrée, pas la vue annotée). */
  lastImage: RgbaImage | null;
  /** Durée réelle de la dernière inférence, en millisecondes ; null avant le premier tick. */
  lastInferenceMs: number | null;
  gate: GateProgress;
}

/** Côté de l'image carrée fournie aux détecteurs (spec 4.4 : vue front réduite à 640 px). */
export const DETECTOR_INPUT_PX = 640;
