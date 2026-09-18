import type { AgentRawKind } from '@tomato/shared';
import { formatNum } from './traceFormat';

/** Une ligne du flux brut de la session agent, telle que l'affiche le panneau terminal. */
export interface RawLine {
  id: number;
  atMs: number;
  kind: AgentRawKind;
  text: string;
}

/**
 * Préfixes de largeur fixe : les lignes s'alignent en colonnes, comme dans un terminal.
 * L'ordre des clés suit celui du contrat `AgentRawKind`.
 */
export const RAW_KIND_LABEL: Record<AgentRawKind, string> = {
  init: 'init',
  text: 'text',
  tool_use: 'tool',
  tool_result: 'res.',
  result: 'done',
  stderr: 'err.',
};

/** Couleur du préfixe, palette de la spec : outil magenta, erreur rouge, fin verte. */
export const RAW_KIND_COLOR: Record<AgentRawKind, string> = {
  init: 'text-axes',
  text: 'text-ink-dim',
  tool_use: 'text-scissors',
  tool_result: 'text-stem',
  result: 'text-unripe',
  stderr: 'text-ripe',
};

/** Ajoute une ligne à la fin (plus ancien en haut) et garde au plus `max` lignes. */
export function pushRawLine(lines: readonly RawLine[], line: RawLine, max: number): RawLine[] {
  return [...lines, line].slice(-max);
}

/** Origine des horodatages relatifs : l'instant du réveil, sinon la première ligre reçue. */
export function rawBaseMs(wakeAtMs: number | null, lines: readonly RawLine[]): number | null {
  return wakeAtMs ?? lines[0]?.atMs ?? null;
}

/** « +1,2 s » depuis le réveil ; chaîne vide tant qu'aucune origine n'est connue. */
export function formatRawTime(atMs: number, baseMs: number | null): string {
  if (baseMs === null) return '';
  return `+${formatNum(Math.max(0, atMs - baseMs) / 1000, 1)} s`;
}
