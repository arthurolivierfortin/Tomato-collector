import type { AgentRunner, AgentRunnerDeps } from '../agentRunner';
import type { WakeEvent } from '../state/session';

/** Module d'agent factice pour tester `loadAgentRunner` (même forme que `src/agent/index.ts` de M6). */
export const wakes: WakeEvent[] = [];

export function createAgentRunner(deps: AgentRunnerDeps): AgentRunner {
  return {
    wake: (event) => {
      wakes.push(event);
      deps.hub.broadcast({ type: 'episode_start', episodeId: deps.session.get().episodeId ?? 'manual', tomatoId: event.tomatoId, sessionResumed: false });
    },
    busy: () => wakes.length > 0,
    stop: () => undefined,
  };
}
