import type { DashboardState, TraceEntry } from './dashboardTypes';

/** Les appels d'outils les plus récents sont dépliés d'office (issue #22). */
export const AUTO_EXPANDED_TOOLS = 3;

/** Identifiants des appels d'outils dépliés par défaut : les `AUTO_EXPANDED_TOOLS` plus récents. */
export function autoExpandedIds(trace: readonly TraceEntry[]): number[] {
  return trace
    .filter((e) => e.kind === 'tool')
    .slice(0, AUTO_EXPANDED_TOOLS)
    .map((e) => e.id);
}

/** Une entrée est dépliée si son état par défaut n'a pas été inversé par un clic sur le bouton de repli. */
export function isTraceExpanded(state: DashboardState, id: number): boolean {
  const override = state.ui.traceOverrides[id];
  return override ?? autoExpandedIds(state.trace).includes(id);
}
