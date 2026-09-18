import { createAgentRunner } from './agentRunner';
import { DEFAULT_MODEL } from './queryOptions';
import { loadSystemPrompt } from './systemPrompt';
import type { AgentHub, AgentRunner, AgentSession, AgentSim, QueryFn } from './types';
import { summarizeWorld } from './wakePrompt';
import { createWakeServer, readWakePort, resolveWakeEvent } from './wakeServer';

/** Réexport : la résolution d'une tomate vit avec le serveur de réveil, qui sert les deux modes (issue #29). */
export { resolveWakeEvent } from './wakeServer';

export interface StartAgentDeps {
  hub: AgentHub;
  session: AgentSession;
  sim: AgentSim;
  mcpUrl: string;
  /** Défaut : `TOMATO_MODEL` ou `claude-opus-5`. */
  model?: string;
  /** Défaut : `TOMATO_WAKE_PORT` ou 7333 ; 0 = port libre. */
  wakePort?: number;
  query?: QueryFn;
  log?: (line: string) => void;
  onDelta?: (text: string) => void;
}

export interface AgentHandle {
  runner: AgentRunner;
  wakePort: number;
  close(): Promise<void>;
}

export function agentEnv(env: NodeJS.ProcessEnv = process.env): { model: string; wakePort: number; enabled: boolean } {
  return {
    model: env.TOMATO_MODEL ?? DEFAULT_MODEL,
    wakePort: readWakePort(env),
    enabled: env.TOMATO_AGENT !== 'off',
  };
}

/**
 * Branche le runner : réveil sur la phase `detected` de la session (cible = `targetTomatoId`),
 * serveur HTTP de réveil manuel, prompt système chargé une fois.
 */
export async function startAgent(deps: StartAgentDeps): Promise<AgentHandle> {
  const env = agentEnv();
  const log = deps.log ?? ((line: string): void => console.log(`[agent] ${line}`));
  const model = deps.model ?? env.model;
  const runner = createAgentRunner({
    hub: deps.hub,
    session: deps.session,
    mcpUrl: deps.mcpUrl,
    model,
    systemPrompt: loadSystemPrompt(),
    statusText: () => summarizeWorld(deps.sim.latestState()),
    resolveWake: (id) => resolveWakeEvent(deps.sim, id),
    log,
    ...(deps.query === undefined ? {} : { query: deps.query }),
    ...(deps.onDelta === undefined ? {} : { onDelta: deps.onDelta }),
  });
  deps.session.onPhase((phase) => {
    if (phase !== 'detected') return;
    const id = deps.session.get().targetTomatoId;
    const event = id === null ? null : resolveWakeEvent(deps.sim, id);
    if (event === null) log(`phase detected without a known target tomato (${String(id)}); no wake`);
    else runner.wake(event);
  });
  const wake = await createWakeServer({
    port: deps.wakePort ?? env.wakePort,
    runner,
    resolve: (id) => resolveWakeEvent(deps.sim, id),
    knownIds: () => (deps.sim.latestState()?.tomatoes ?? []).map((t) => t.id),
  });
  log(`model ${model}, MCP ${deps.mcpUrl}, manual wake on http://127.0.0.1:${wake.port}/wake/<tomatoId>`);
  return {
    runner,
    wakePort: wake.port,
    close: async () => {
      const drained = runner.stop();
      await wake.close();
      await drained;
    },
  };
}
