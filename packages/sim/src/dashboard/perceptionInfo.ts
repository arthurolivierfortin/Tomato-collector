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

/** « détecteur/contours » affiché dans le bandeau ; sans M4 : « HSV/Sobel » (contrat Étape 3). */
export function detectorLabel(info: PerceptionInfo | null): string {
  if (info === null) return 'HSV/Sobel';
  const detector = info.lastDetector ?? (info.yoloReady ? 'yolo' : 'hsv');
  return `${detector}/${info.opencvReady ? 'Canny' : 'Sobel'}`;
}
