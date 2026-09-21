import { createAgentRunner as createRunner } from './agentRunner';
import { agentEnv, resolveWakeEvent } from './startAgent';
import { loadSystemPrompt } from './systemPrompt';
import type { AgentHub, AgentRunner, AgentSession, AgentSim, QueryFn } from './types';
import { summarizeWorld } from './wakePrompt';
import { createWakeServer } from './wakeServer';
import type { WakeServer } from './wakeServer';

export type { AgentHandle, StartAgentDeps } from './startAgent';
export { agentEnv, resolveWakeEvent, startAgent } from './startAgent';
export type { AgentHub, AgentRunner, AgentSession, AgentSim, QueryFn, WakeEvent } from './types';
export { loadSystemPrompt } from './systemPrompt';
export { DEFAULT_MODEL } from './queryOptions';
export { DEFAULT_WAKE_PORT } from './wakeServer';

/**
 * Dépendances passées par `loadAgentRunner` de M5 (`packages/server/src/agentRunner.ts`),
 * plus les extensions optionnelles de M6 (pont sim, port de réveil, injection pour les tests).
 */
export interface ServerAgentRunnerDeps {
  hub: AgentHub;
  session: AgentSession;
  mcpUrl: string;
  model: string;
  /** Prompt lu par M5 dans `prompts/system.md` ; vide = M6 le charge lui-même. */
  systemPrompt: string;
  /** Pont sim de M5 : résumé d'état dans le réveil et résolution des identifiants du réveil manuel. */
  sim?: AgentSim;
  /** Port du serveur de réveil manuel ; 0 = port libre, négatif = pas de serveur. */
  wakePort?: number;
  query?: QueryFn;
  /**
   * Délai laissé au message `result` après un `report`, à l'arrêt du serveur. Absent : celui du
   * runner (5 s), qui suffit au SDK. M5 en passe un bien plus long en mode visible, où le `result`
   * du CLI n'arrive qu'après un tour de modèle complet — et où c'est lui qui porte le coût.
   */
  stopDrainMs?: number;
  log?: (line: string) => void;
  onDelta?: (text: string) => void;
}

export interface ServerAgentRunner extends AgentRunner {
  /** Port du serveur de réveil manuel une fois écouté, null s'il n'y en a pas. */
  whenReady(): Promise<{ wakePort: number | null }>;
  /** Résolue quand le serveur de réveil est fermé après `stop()`. */
  whenClosed(): Promise<void>;
}

/**
 * Point d'entrée chargé dynamiquement par `index.ts` de M5 (`AGENT_MODULE = './agent/index.js'`).
 * M5 branche lui-même `session.onWake` sur `runner.wake` : ce module ne s'abonne donc pas à `onPhase`,
 * pour ne pas réveiller deux fois le même épisode.
 */
export function createAgentRunner(deps: ServerAgentRunnerDeps): ServerAgentRunner {
  const env = agentEnv();
  const log = deps.log ?? ((line: string): void => console.log(`[agent] ${line}`));
  const sim = deps.sim ?? null;
  const runner = createRunner({
    hub: deps.hub,
    session: deps.session,
    mcpUrl: deps.mcpUrl,
    model: deps.model === '' ? env.model : deps.model,
    systemPrompt: deps.systemPrompt.trim() === '' ? loadSystemPrompt() : deps.systemPrompt,
    statusText: () => summarizeWorld(sim?.latestState() ?? null),
    resolveWake: (id) => (sim === null ? null : resolveWakeEvent(sim, id)),
    log,
    ...(deps.query === undefined ? {} : { query: deps.query }),
    ...(deps.stopDrainMs === undefined ? {} : { stopDrainMs: deps.stopDrainMs }),
    ...(deps.onDelta === undefined ? {} : { onDelta: deps.onDelta }),
  });

  const port = deps.wakePort ?? env.wakePort;
  const server: Promise<WakeServer | null> =
    port < 0
      ? Promise.resolve(null)
      : createWakeServer({
          port,
          runner,
          resolve: (id) => (sim === null ? null : resolveWakeEvent(sim, id)),
          knownIds: () => (sim?.latestState()?.tomatoes ?? []).map((t) => t.id),
        }).catch((e: unknown) => {
          log(`manual wake server unavailable on port ${port} (${String(e)})`);
          return null;
        });
  void server.then((s) => {
    if (s !== null) log(`manual wake on http://127.0.0.1:${s.port}/wake/<tomatoId>`);
  });

  let closed: Promise<void> = Promise.resolve();
  return {
    ...runner,
    whenIdle: () => runner.whenIdle(),
    stop() {
      // `closed` est posé tout de suite : `whenClosed()` reste utilisable sans attendre `stop()`,
      // qui peut, lui, laisser quelques secondes au SDK pour livrer le coût de l'épisode.
      const drained = runner.stop();
      closed = server.then(async (s) => {
        if (s !== null) await s.close();
      });
      return drained;
    },
    whenReady: async () => ({ wakePort: (await server)?.port ?? null }),
    whenClosed: () => closed,
  };
}
