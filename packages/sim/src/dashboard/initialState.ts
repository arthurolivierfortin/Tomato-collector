import type { DashboardState } from './dashboardTypes';

/** Modèle affiché tant que le serveur n'en a pas annoncé un autre (`TOMATO_MODEL` par défaut, contrat Étape 3). */
export const DEFAULT_MODEL = 'claude-opus-5';

export function initialDashboardState(model: string | null = DEFAULT_MODEL): DashboardState {
  return {
    connection: 'disconnected',
    phase: 'idle',
    phaseAtMs: null,
    episode: null,
    counters: { harvested: 0, missed: 0, aborted: 0 },
    trace: [],
    nextTraceId: 1,
    views: { top: null, front: null, side: null },
    lastViewsAt: null,
    blocks: { active: null, flow: null, atMs: null },
    costUsd: 0,
    model,
    sim: { simTimeS: 0, timeScale: 1, paused: false },
    ui: { controlsHidden: false, agentView: false, diagramOpen: true, enlarged: null },
  };
}
