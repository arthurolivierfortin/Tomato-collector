/**
 * Marqueurs horodatés d'une prise : le pilote de la page (`record.ts`) pose un marqueur nommé
 * quand il atteint un moment intéressant ; le montage (`montage.ts`) s'en sert pour savoir où
 * découper et où figer, sans qu'un instant soit écrit en dur dans le plan.
 */

export type TakeMode = 'live' | 'replay';

export interface Marker {
  readonly name: string;
  /** Millisecondes depuis le premier instant enregistré de la prise. */
  readonly atMs: number;
}

export interface TakeMarkers {
  readonly take: string;
  /** Nom du fichier vidéo de la prise, relatif au dossier des prises. */
  readonly video: string;
  readonly mode: TakeMode;
  readonly startedAt: string;
  readonly durationMs: number;
  readonly markers: readonly Marker[];
  /** Marqueurs que le scénario prévoyait et qui n'ont pas été atteints (prise interrompue). */
  readonly missing: readonly string[];
  /** Étape sur laquelle la prise s'est arrêtée, absente si elle est allée au bout. */
  readonly failedStep?: string;
  /**
   * Instant de la première peinture de la page, depuis le début de la vidéo. Purement indicatif :
   * il dit ce que le spectateur voit avant que la page s'affiche (0,9 s sur un Vite chaud, une
   * dizaine de secondes à froid). Ce n'est **pas** l'origine des marqueurs.
   */
  readonly firstPaintMs?: number;
}

export interface TakeMeta {
  readonly take: string;
  readonly video: string;
  readonly mode: TakeMode;
  readonly startedAt: string;
  /** Marqueurs prévus par le scénario, dans l'ordre : sert à nommer ceux qui manquent. */
  readonly expected?: readonly string[];
  readonly failedStep?: string;
  readonly firstPaintMs?: number;
}

export interface MarkerLog {
  /** Fixe l'origine des temps à maintenant. */
  start(): void;
  /**
   * Fixe l'origine des temps à un instant connu (epoch ms). Le pilote y met l'instant où la page de
   * capture s'ouvre : Playwright démarre le screencast à la création de la page, pas à la première
   * peinture, et c'est donc l'instant t = 0 du fichier vidéo.
   */
  startAt(epochMs: number): void;
  mark(name: string): void;
  snapshot(meta: TakeMeta): TakeMarkers;
}

function isRecord(x: unknown): x is Record<string, unknown> {
  return typeof x === 'object' && x !== null;
}

function isMarker(x: unknown): x is Marker {
  return isRecord(x) && typeof x['name'] === 'string' && typeof x['atMs'] === 'number';
}

export function isTakeMarkers(x: unknown): x is TakeMarkers {
  if (!isRecord(x)) return false;
  if (typeof x['take'] !== 'string' || typeof x['durationMs'] !== 'number') return false;
  if (typeof x['video'] !== 'string') return false;
  if (x['missing'] !== undefined && !Array.isArray(x['missing'])) return false;
  return Array.isArray(x['markers']) && x['markers'].every(isMarker);
}

/** Instant d'un marqueur, en millisecondes ; l'absence est une erreur de plan, pas un cas à deviner. */
export function markerMs(take: TakeMarkers, name: string): number {
  const found = take.markers.find((m) => m.name === name);
  if (found === undefined) {
    const known = take.markers.map((m) => m.name).join(', ');
    throw new Error(`prise « ${take.take} » : marqueur « ${name} » absent (connus : ${known || 'aucun'})`);
  }
  return found.atMs;
}

export function markerS(take: TakeMarkers, name: string): number {
  return markerMs(take, name) / 1000;
}

export function createMarkerLog(nowMs: () => number): MarkerLog {
  let origin: number | null = null;
  const marks: Marker[] = [];
  return {
    start() {
      origin = nowMs();
    },
    startAt(epochMs) {
      origin = epochMs;
    },
    mark(name) {
      if (origin === null) throw new Error(`marqueur « ${name} » posé avant start() : la prise n'a pas d'origine`);
      if (marks.some((m) => m.name === name)) throw new Error(`marqueur « ${name} » posé deux fois dans la même prise`);
      marks.push({ name, atMs: nowMs() - origin });
    },
    snapshot({ expected = [], failedStep, firstPaintMs, ...meta }) {
      if (origin === null) throw new Error('snapshot() avant start() : la prise n’a pas d’origine');
      const posed = new Set(marks.map((m) => m.name));
      return {
        ...meta,
        durationMs: nowMs() - origin,
        markers: [...marks],
        missing: expected.filter((name) => !posed.has(name)),
        ...(failedStep === undefined ? {} : { failedStep }),
        ...(firstPaintMs === undefined ? {} : { firstPaintMs }),
      };
    },
  };
}
