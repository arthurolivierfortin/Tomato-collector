/**
 * Garde de type d'un plan de montage lu depuis un JSON (`--plan-file`). Séparée du plan lui-même :
 * c'est de la validation de données, pas de la résolution de marqueurs, et un plan bâclé doit
 * échouer avant que ffmpeg ne démarre.
 */
import type { MontagePlan } from './plan';

function isRecord(x: unknown): x is Record<string, unknown> {
  return typeof x === 'object' && x !== null;
}

function isTimeRef(x: unknown): boolean {
  if (typeof x === 'number' || x === 'end') return true;
  return isRecord(x) && typeof x['marker'] === 'string' && (x['offsetS'] === undefined || typeof x['offsetS'] === 'number');
}

function isTitle(x: unknown): boolean {
  if (!isRecord(x) || typeof x['text'] !== 'string' || typeof x['durationS'] !== 'number') return false;
  // Carton de signature : une ligne d'auteur, et un fondu au noir exprimé en secondes.
  if (x['byline'] !== undefined && typeof x['byline'] !== 'string') return false;
  return x['fadeS'] === undefined || typeof x['fadeS'] === 'number';
}

function isRect(x: unknown): boolean {
  return isRecord(x) && ['x', 'y', 'w', 'h'].every((k) => typeof x[k] === 'number');
}

/** Un agrandissement : la zone à recadrer, et les trois éléments écrits à côté d'elle. */
function isZoom(x: unknown): boolean {
  return isRecord(x) && isRect(x['source']) && ['input', 'by', 'output'].every((k) => typeof x[k] === 'string');
}

/** Un écran partagé : deux rectangles de la prise, leur partage, et le titre de la bande du haut. */
function isSplit(x: unknown): boolean {
  return isRecord(x) && isRect(x['left']) && isRect(x['right']) && typeof x['leftRatio'] === 'number' && typeof x['title'] === 'string';
}

function isFreeze(f: unknown): boolean {
  if (!isRecord(f) || !isTimeRef(f['at']) || typeof f['durationS'] !== 'number' || typeof f['caption'] !== 'string') return false;
  if (f['captionFullWidth'] !== undefined && typeof f['captionFullWidth'] !== 'boolean') return false;
  if (f['split'] !== undefined && !isSplit(f['split'])) return false;
  return f['zoom'] === undefined || isZoom(f['zoom']);
}

function isEntry(x: unknown): boolean {
  if (!isRecord(x)) return false;
  if ('card' in x) return isTitle(x['card']);
  if (typeof x['take'] !== 'string' || !isTimeRef(x['from']) || !isTimeRef(x['to'])) return false;
  if (x['title'] !== undefined && !isTitle(x['title'])) return false;
  if (x['optional'] !== undefined && typeof x['optional'] !== 'boolean') return false;
  if (x['captionFullWidth'] !== undefined && typeof x['captionFullWidth'] !== 'boolean') return false;
  if (x['split'] !== undefined && !isSplit(x['split'])) return false;
  const freezes = x['freezeAt'];
  if (freezes === undefined) return true;
  return Array.isArray(freezes) && freezes.every(isFreeze);
}

/** Garde de type d'un plan lu depuis un JSON (`--plan-file`) : un plan bâclé échoue avant ffmpeg. */
export function isMontagePlan(x: unknown): x is MontagePlan {
  if (!isRecord(x)) return false;
  if (typeof x['output'] !== 'string') return false;
  for (const key of ['width', 'height', 'fps']) if (typeof x[key] !== 'number') return false;
  return Array.isArray(x['segments']) && x['segments'].every(isEntry);
}
