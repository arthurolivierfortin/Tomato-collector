import { detectorName } from '../perception/pipelineModel';
import { DETECTOR_INPUT_PX } from '../perception/types';

/** Sous-ensemble de `perceptionState()` exporté par M4 (contrat Étape 3). */
export interface PerceptionInfo {
  opencvReady: boolean;
  yoloReady: boolean;
  lastDetector: 'yolo' | 'hsv' | null;
}

export type PerceptionReader = () => PerceptionInfo;
type ModuleLoader = () => Promise<unknown>;

/** M4 n'est peut-être pas mergé : le glob renvoie un objet vide si aucun de ces fichiers n'existe. */
const CANDIDATES: Record<string, ModuleLoader> = import.meta.glob(['../perception/perceptionModule.ts', '../perception/index.ts']);

export async function loadPerceptionState(candidates: Record<string, ModuleLoader> = CANDIDATES): Promise<PerceptionReader | null> {
  for (const load of Object.values(candidates)) {
    const mod = (await load()) as { perceptionState?: unknown };
    if (typeof mod.perceptionState === 'function') return mod.perceptionState as PerceptionReader;
  }
  return null;
}

/**
 * « détecteur / contours » affiché dans le bandeau. Issue #36 : le détecteur est nommé en entier
 * (« YOLOv8n ONNX 640 » ou « seuillage HSV 640 ») pour qu'on ne puisse pas confondre le modèle appris
 * et le repli par seuillage. Sans M4 : le repli HSV/Sobel (contrat Étape 3).
 */
export function detectorLabel(info: PerceptionInfo | null): string {
  const detector = info === null ? 'hsv' : (info.lastDetector ?? (info.yoloReady ? 'yolo' : 'hsv'));
  const edges = info?.opencvReady === true ? 'Canny' : 'Sobel';
  return `${detectorName(detector, DETECTOR_INPUT_PX)} / ${edges}`;
}
