import { emptyQueue } from './blockQueue';
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
    viewsAt: { top: null, front: null, side: null },
    featured: 'front',
    lastViewsAt: null,
    raw: [],
    nextRawId: 1,
    rawEpisodeId: null,
    rawSinceMs: null,
    wake: null,
    ripening: null,
    blocks: emptyQueue(),
    costUsd: 0,
    model,
    sim: { simTimeS: 0, timeScale: 1, paused: false },
    ui: { controlsHidden: false, agentView: false, diagramOpen: true, sessionOpen: true, lightbox: null, traceOverrides: {} },
  };
}
