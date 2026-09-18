import type { DetectorKind } from '@tomato/shared';
import { detectorName } from '../perception/pipelineModel';
import { DETECTOR_INPUT_PX, type Detection, type PerceptionState } from '../perception/types';
import { formatNum } from './traceFormat';

/** Position d'une boîte en pourcentage de l'image affichée, pour la poser en CSS sans canevas. */
export interface BoxStyle {
  left: string;
  top: string;
  width: string;
  height: string;
}

/**
 * Détecteur réellement actif : celui du dernier tick, sinon celui qui tournerait au prochain.
 * Issue #36 : le dashboard ne doit jamais laisser croire qu'un modèle décide alors que c'est HSV.
 */
export function activeDetector(state: PerceptionState): DetectorKind {
  return state.lastDetector ?? (state.yoloReady ? 'yolo' : 'hsv');
}

export function activeDetectorName(state: PerceptionState): string {
  return detectorName(activeDetector(state), DETECTOR_INPUT_PX);
}

/** « modèle chargé » / « mode dégradé HSV » : dit si le .onnx a été trouvé. */
export function modelStatusLabel(state: PerceptionState): string {
  return state.yoloReady ? 'modèle chargé' : 'mode dégradé HSV';
}

export function edgesLabel(state: PerceptionState): string {
  return state.opencvReady ? 'contours Canny + CLAHE' : 'contours Sobel (OpenCV.js absent)';
}

export function inferenceLabel(state: PerceptionState): string {
  return state.lastInferenceMs === null ? 'aucune inférence' : `${formatNum(state.lastInferenceMs, 1)} ms`;
}

/** « 3/5 frames consécutives (tomate 2) » : où en est la porte de réveil. */
export function gateLabel(state: PerceptionState): string {
  const { tomatoId, count, target } = state.gate;
  const suffix = tomatoId === null ? 'aucune tomate suivie' : `tomate ${tomatoId}`;
  return `${count}/${target} frames consécutives · ${suffix}`;
}

export function detectionLabel(d: Detection): string {
  return `${d.label} ${formatNum(d.score, 2)}`;
}

/** Boîte en pourcentage de l'image du détecteur : indépendante de la taille d'affichage du panneau. */
export function boxStyle(d: Detection, widthPx: number, heightPx: number): BoxStyle {
  const pct = (v: number, total: number): string => `${((v / total) * 100).toFixed(3)}%`;
  const [x, y, w, h] = d.bbox;
  return { left: pct(x, widthPx), top: pct(y, heightPx), width: pct(w, widthPx), height: pct(h, heightPx) };
}
