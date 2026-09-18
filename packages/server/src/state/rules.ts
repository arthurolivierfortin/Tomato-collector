import type { Phase, ToolName } from '@tomato/shared';

export type EpisodeOutcome = 'harvested' | 'missed' | 'aborted';

/** Outils dont le premier appel fait passer de `detected` à `harvesting`. */
export const MOVEMENT_TOOLS: ReadonlySet<ToolName> = new Set<ToolName>([
  'move_scissors', 'rotate_scissors', 'open_scissors', 'move_basket', 'cut',
]);

const CUT_SEQUENCE: readonly Phase[] = ['cutting', 'falling'];

/** Phases à enchaîner après le résultat d'un outil (vide = rien ne change). */
export function phasesAfterToolResult(phase: Phase, tool: ToolName, ok: boolean): Phase[] {
  const out: Phase[] = [];
  let current = phase;
  if (MOVEMENT_TOOLS.has(tool) && current === 'detected') {
    out.push('harvesting');
    current = 'harvesting';
  }
  if (tool === 'cut' && ok && current === 'harvesting') out.push(...CUT_SEQUENCE);
  return out;
}

/** `tomato_landed` ne décide que pendant la chute. */
export function phaseAfterLanding(phase: Phase, inBasket: boolean): Phase | null {
  if (phase !== 'falling') return null;
  return inBasket ? 'harvested' : 'missed';
}

/** Issue réelle d'un épisode d'après la phase où il se termine (la vérité vient de la sim, pas de l'agent). */
export function outcomeForPhase(phase: Phase): EpisodeOutcome {
  if (phase === 'harvested' || phase === 'missed') return phase;
  return 'aborted';
}

/**
 * Phases à enchaîner pour clore un épisode depuis `phase` ; null si la clôture est impossible
 * pour l'instant (chute en cours) ou sans objet (idle).
 */
export function phasesToClose(phase: Phase): Phase[] | null {
  switch (phase) {
    case 'harvested':
    case 'missed':
    case 'aborted':
      return ['idle'];
    case 'detected':
    case 'harvesting':
    case 'cutting':
      return ['aborted', 'idle'];
    case 'falling':
    case 'idle':
      return null;
  }
}
