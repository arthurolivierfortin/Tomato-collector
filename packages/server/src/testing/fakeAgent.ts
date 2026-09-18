import type { AgentRunner, AgentRunnerDeps } from '../agentRunner';
import type { WakeEvent } from '../state/session';

/** Module d'agent factice pour tester `loadAgentRunner` (même forme que `src/agent/index.ts` de M6). */
export const wakes: WakeEvent[] = [];
/** Dernières dépendances reçues : vérifie que `index.ts` passe bien le pont sim à M6. */
export let lastDeps: AgentRunnerDeps | null = null;

export function createAgentRunner(deps: AgentRunnerDeps): AgentRunner {
  lastDeps = deps;
  return {
    wake: (event) => {
      wakes.push(event);
      deps.hub.broadcast({ type: 'episode_start', episodeId: deps.session.get().episodeId ?? 'manual', tomatoId: event.tomatoId, sessionResumed: false });
    },
    busy: () => wakes.length > 0,
    stop: () => Promise.resolve(),
  };
}
