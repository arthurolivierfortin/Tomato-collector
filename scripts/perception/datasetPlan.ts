import type { CameraName, SampleLabel } from './pageGlobals';

/** Ordre des classes du modèle exporté par `scripts/export-yolo.py` (0 = unripe, 1 = ripe). */
export const CLASS_NAMES = ['unripe', 'ripe'] as const;
export const CAMERAS: readonly CameraName[] = ['front', 'top', 'side'];

/** `front` par défaut : c'est la seule vue sur laquelle le détecteur tourne en production (spec 4.4). */
export type CameraChoice = CameraName | 'all';

export interface DatasetArgs {
  count: number;
  port: number;
  seed: number;
  out: string;
  camera: CameraChoice;
}

export interface PlanStep {
  index: number;
  /** Nombre de fruits mûris avant la prise : 0 à 4, pour varier les scènes. */
  ripenCount: number;
  /** Temps laissé à la sim pour que la couleur monte et que le rendu se stabilise. */
  settleMs: number;
}

export interface SampleRecord {
  name: string;
  camera: CameraName;
  ripe: number;
  unripe: number;
}

export function parseArgs(argv: readonly string[]): DatasetArgs {
  const read = (flag: string, fallback: number): number => {
    const i = argv.indexOf(flag);
    const value = i >= 0 ? Number(argv[i + 1]) : NaN;
    return Number.isFinite(value) ? value : fallback;
  };
  const outIndex = argv.indexOf('--out');
  const cameraIndex = argv.indexOf('--camera');
  const camera = cameraIndex >= 0 ? argv[cameraIndex + 1] : undefined;
  return {
    count: read('--count', 100),
    port: read('--port', 5319),
    seed: read('--seed', 36),
    out: outIndex >= 0 ? (argv[outIndex + 1] ?? 'data/perception/eval') : 'data/perception/eval',
    camera: camera === 'all' || camera === 'top' || camera === 'side' || camera === 'front' ? camera : 'front',
  };
}

/** Générateur déterministe simple (xorshift 32 bits) : le jeu est reproductible d'une exécution à l'autre. */
function rng(seed: number): () => number {
  let s = seed >>> 0 || 1;
  return () => {
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    return ((s >>> 0) % 1_000_000) / 1_000_000;
  };
}

/** Plan des prises : maturités variées (de 0 à 4 fruits mûrs) et temps de stabilisation étalés. */
export function plan(count: number, seed: number): PlanStep[] {
  const next = rng(seed);
  return Array.from({ length: count }, (_, index) => ({
    index,
    ripenCount: Math.floor(next() * 5),
    settleMs: 200 + Math.floor(next() * 500),
  }));
}

export function pickCamera(index: number, choice: CameraChoice = 'all'): CameraName {
  return choice === 'all' ? CAMERAS[index % CAMERAS.length]! : choice;
}

/** Boîtes en format YOLO : `classe cx cy w h`, normalisés par la taille de l'image. */
export function toYoloLines(labels: readonly SampleLabel[], widthPx: number, heightPx: number): string {
  return labels
    .map((l) => {
      const [x, y, w, h] = l.bbox;
      const values = [(x + w / 2) / widthPx, (y + h / 2) / heightPx, w / widthPx, h / heightPx];
      return `${CLASS_NAMES.indexOf(l.label)} ${values.map((v) => v.toFixed(6)).join(' ')}`;
    })
    .join('\n')
    .concat(labels.length > 0 ? '\n' : '');
}
