import type { CameraId, Phase, ServerToDashboard, SimEvent } from '@tomato/shared';
import type { Outcome } from './dashboardTypes';

export const PHASE_LABEL: Record<Phase, string> = {
  idle: 'repos',
  detected: 'détectée',
  harvesting: 'récolte',
  cutting: 'coupe',
  falling: 'chute',
  harvested: 'récoltée',
  missed: 'ratée',
  aborted: 'abandon',
};

export const OUTCOME_LABEL: Record<Outcome, string> = { harvested: 'récoltée', missed: 'ratée', aborted: 'abandon' };

const MINUS = '−';
const ALL_CAMERAS: readonly CameraId[] = ['top', 'front', 'side'];

/** Nombre en notation française : virgule décimale, signe moins typographique, jamais « −0 ». */
export function formatNum(n: number, digits = 0): string {
  const fixed = Math.abs(n).toFixed(digits);
  const negative = n < 0 && Number(fixed) !== 0;
  return `${negative ? MINUS : ''}${fixed.replace('.', ',')}`;
}

export function formatSigned(n: number, digits = 0): string {
  return n > 0 ? `+${formatNum(n, digits)}` : formatNum(n, digits);
}

/** Centimètres ou degrés : entier tel quel, sinon une décimale. */
export function formatCm(n: number): string {
  return Number.isInteger(n) ? formatNum(n) : formatNum(n, 1);
}

export function formatDuration(ms: number): string {
  if (ms < 1000) return `${Math.round(ms)} ms`;
  if (ms < 60_000) return `${formatNum(ms / 1000, 1)} s`;
  const min = Math.floor(ms / 60_000);
  const s = Math.round((ms - min * 60_000) / 1000);
  return `${min} min ${String(s).padStart(2, '0')} s`;
}

export function formatCost(usd: number): string {
  return `${formatNum(usd, 4)} $`;
}

/** Heure locale HH:MM:SS d'un horodatage en ms. */
export function formatClock(atMs: number): string {
  const d = new Date(atMs);
  return [d.getHours(), d.getMinutes(), d.getSeconds()].map((v) => String(v).padStart(2, '0')).join(':');
}

export function firstLine(text: string, max: number): string {
  const line = text.trim().split('\n')[0] ?? '';
  return line.length > max ? `${line.slice(0, max - 1)}…` : line;
}

type Args = Record<string, unknown>;

const num = (args: Args, key: string): number | undefined => {
  const v = args[key];
  return typeof v === 'number' && Number.isFinite(v) ? v : undefined;
};

const str = (args: Args, key: string): string | undefined => {
  const v = args[key];
  return typeof v === 'string' ? v : undefined;
};

/** « X 12, Y 4 » (absolu) ou « ΔX +5, ΔY 0 » (relatif) pour les clés fournies, avec un suffixe optionnel (°). */
function coords(args: Args, keys: readonly string[], labels: readonly string[], relative: boolean, unit = ''): string[] {
  const out: string[] = [];
  keys.forEach((key, i) => {
    const v = num(args, key);
    if (v === undefined) return;
    const label = labels[i] ?? key;
    const value = relative ? (Number.isInteger(v) ? formatSigned(v) : formatSigned(v, 1)) : formatCm(v);
    out.push(`${relative ? `Δ${label}` : label} ${value}${unit}`);
  });
  return out;
}

const XYZ = ['x', 'y', 'z'] as const;
const XYZ_LABELS = ['X', 'Y', 'Z'] as const;
const ANGLES = ['yaw', 'pitch', 'roll'] as const;
const ANGLE_LABELS = ['lacet', 'tangage', 'roulis'] as const;

/** Titre d'une ligne d'appel d'outil, en français, avec ses arguments en clair. */
export function toolTitle(tool: string, args: Args): string {
  const relative = str(args, 'mode') === 'relative';
  switch (tool) {
    case 'get_status':
      return 'État demandé';
    case 'get_views': {
      const raw = args['cameras'];
      const cams = Array.isArray(raw) ? raw.filter((c): c is string => typeof c === 'string') : [];
      return `Vues demandées : ${(cams.length > 0 ? cams : ALL_CAMERAS).join(', ')}`;
    }
    case 'move_camera': {
      const parts = [
        ...coords(args, ['dx', 'dy', 'dz'], ['dX', 'dY', 'dZ'], false),
        ...coords(args, ['yaw', 'tilt'], ['lacet', 'tangage'], false, '°'),
      ].map((p) => p.replace(/^(d[XYZ]|lacet|tangage) (?![+−])/, '$1 +'));
      const zoom = num(args, 'zoom');
      if (zoom !== undefined) parts.push(`zoom ×${formatNum(zoom, 1)}`);
      return `Caméra ${str(args, 'camera') ?? '?'} : ${parts.length > 0 ? parts.join(', ') : 'sans changement'}`;
    }
    case 'move_scissors': {
      const parts = coords(args, XYZ, XYZ_LABELS, relative);
      return relative ? `Ciseaux : ${parts.join(', ')}` : `Ciseaux → ${parts.join(', ')}`;
    }
    case 'rotate_scissors': {
      const parts = coords(args, ANGLES, ANGLE_LABELS, relative, '°').map((p) => p.replace(/^Δ/, ''));
      return `${relative ? 'Ciseaux tournés' : 'Ciseaux orientés'} : ${parts.length > 0 ? parts.join(', ') : 'sans changement'}`;
    }
    case 'open_scissors':
      return 'Ciseaux ouverts';
    case 'cut':
      return 'Coupe';
    case 'move_basket': {
      const parts = coords(args, ['x', 'y'], ['X', 'Y'], relative);
      return relative ? `Panier : ${parts.join(', ')}` : `Panier → ${parts.join(', ')}`;
    }
    case 'report': {
      const outcome = str(args, 'outcome');
      const label = outcome === 'harvested' || outcome === 'missed' || outcome === 'aborted' ? OUTCOME_LABEL[outcome] : (outcome ?? '?');
      return `Rapport : ${label}`;
    }
    default:
      return `Outil ${tool}`;
  }
}

export function eventTitle(e: SimEvent): string {
  switch (e.type) {
    case 'ripe_detected':
      return `Tomate ${e.tomatoId} mûre détectée (${e.detector}, ${formatNum(e.confidence, 2)})`;
    case 'tomato_landed':
      return e.inBasket ? `Tomate ${e.tomatoId} dans le panier` : `Tomate ${e.tomatoId} tombée au sol`;
    case 'plant_regenerated':
      return `Nouveau plant (graine ${e.seed})`;
  }
}

export function phaseTitle(phase: Phase): string {
  return `Phase ${PHASE_LABEL[phase]}`;
}

export function snapshotTitle(phase: Phase): string {
  return `État reçu du serveur, phase ${PHASE_LABEL[phase]}`;
}

export function episodeStartTitle(m: Extract<ServerToDashboard, { type: 'episode_start' }>): string {
  return `Épisode ${m.episodeId} : tomate ${m.tomatoId}, ${m.sessionResumed ? 'session reprise' : 'nouvelle session'}`;
}

export function episodeEndTitle(m: Extract<ServerToDashboard, { type: 'episode_end' }>): string {
  return `Épisode terminé : ${OUTCOME_LABEL[m.outcome]}, ${m.toolCalls} appels, ${formatDuration(m.durationMs)}, ${formatCost(m.costUsd)}`;
}

export function viewsTitle(cameras: readonly CameraId[]): string {
  return `Vues rendues : ${cameras.join(', ')}`;
}
