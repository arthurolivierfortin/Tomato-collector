import type { Hub } from './hub/hub';
import { silentLogger, type Logger } from './log';
import type { Session, WakeEvent } from './state/session';

/** Contrat du runner d'agent (implémenté par M6 dans `src/agent/`). */
export interface AgentRunner {
  wake(event: WakeEvent): void;
  busy(): boolean;
  stop(): void;
}

export interface AgentRunnerDeps {
  hub: Hub;
  session: Session;
  mcpUrl: string;
  model: string;
  systemPrompt: string;
}

export type CreateAgentRunner = (deps: AgentRunnerDeps) => AgentRunner;

/** Module M6 attendu : `packages/server/src/agent/index.ts` exportant `createAgentRunner`. */
export const AGENT_MODULE: string = './agent/index.js';

/** Runner inerte : TOMATO_AGENT=off ou M6 absent (pilotage à la main depuis Claude Code). */
export function createNoopRunner(log: Logger = silentLogger): AgentRunner {
  return {
    wake: (event) => log(`agent: désactivé, réveil ignoré (tomate ${event.tomatoId})`),
    busy: () => false,
    stop: () => undefined,
  };
}

function hasFactory(mod: unknown): mod is { createAgentRunner: CreateAgentRunner } {
  return typeof mod === 'object' && mod !== null && typeof (mod as { createAgentRunner?: unknown }).createAgentRunner === 'function';
}

/** Charge le runner M6 s'il existe ; sinon journalise et renvoie le runner inerte. */
export async function loadAgentRunner(deps: AgentRunnerDeps, log: Logger = silentLogger, specifier: string = AGENT_MODULE): Promise<AgentRunner> {
  let mod: unknown;
  try {
    mod = await import(specifier);
  } catch (e) {
    log(`agent: module ${specifier} absent (${String(e)}), runner désactivé`);
    return createNoopRunner(log);
  }
  if (!hasFactory(mod)) {
    log(`agent: ${specifier} n'exporte pas createAgentRunner, runner désactivé`);
    return createNoopRunner(log);
  }
  return mod.createAgentRunner(deps);
}
