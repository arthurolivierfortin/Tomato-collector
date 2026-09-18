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
  return isRecord(x) && typeof x['text'] === 'string' && typeof x['durationS'] === 'number';
}

function isEntry(x: unknown): boolean {
  if (!isRecord(x)) return false;
  if ('card' in x) return isTitle(x['card']);
  if (typeof x['take'] !== 'string' || !isTimeRef(x['from']) || !isTimeRef(x['to'])) return false;
  if (x['title'] !== undefined && !isTitle(x['title'])) return false;
  if (x['optional'] !== undefined && typeof x['optional'] !== 'boolean') return false;
  const freezes = x['freezeAt'];
  if (freezes === undefined) return true;
  return Array.isArray(freezes) && freezes.every((f: unknown) => isRecord(f) && isTimeRef(f['at']) && typeof f['durationS'] === 'number' && typeof f['caption'] === 'string');
}

/** Garde de type d'un plan lu depuis un JSON (`--plan-file`) : un plan bâclé échoue avant ffmpeg. */
export function isMontagePlan(x: unknown): x is MontagePlan {
  if (!isRecord(x)) return false;
  if (typeof x['output'] !== 'string') return false;
  for (const key of ['width', 'height', 'fps']) if (typeof x[key] !== 'number') return false;
  return Array.isArray(x['segments']) && x['segments'].every(isEntry);
}
