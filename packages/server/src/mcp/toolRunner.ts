import { randomUUID } from 'node:crypto';
import { MAX_TOOL_CALLS_PER_EPISODE, type ToolName } from '@tomato/shared';
import { silentLogger, type Logger } from '../log';
import { text } from './format';
import { createToolHandlers, type ToolDeps, type ToolOutcome } from './handlers';

export type ToolRunner = (tool: ToolName, rawArgs: unknown) => Promise<ToolOutcome>;

export interface ToolRunnerOptions {
  now?: () => number;
  newId?: () => string;
  log?: Logger;
  /**
   * Durée minimale d'un appel, de `tool_call_start` à `tool_call_result` (issue #21) :
   * 0 par défaut (tests), `config.toolPacingMs` en vrai. `report` n'est jamais retardé.
   */
  pacingMs?: number;
  /** Attente injectable (horloge factice dans les tests). */
  wait?: (ms: number) => Promise<void>;
}

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

export const LIMIT_TEXT = `limite atteinte : ${MAX_TOOL_CALLS_PER_EPISODE} appels d'outils dans cet épisode ; appelle report maintenant`;

const asRecord = (raw: unknown): Record<string, unknown> => (typeof raw === 'object' && raw !== null ? (raw as Record<string, unknown>) : {});

/**
 * Enveloppe commune des neuf outils : diffusion `tool_call_start` / `tool_call_result` (résumé français, durée),
 * compteur d'appels et garde MAX_TOOL_CALLS_PER_EPISODE, règles de phase, jamais d'exception vers l'agent.
 */
export function createToolRunner(deps: ToolDeps, opts: ToolRunnerOptions = {}): ToolRunner {
  const now = opts.now ?? Date.now;
  const newId = opts.newId ?? randomUUID;
  const log = opts.log ?? silentLogger;
  const pacingMs = opts.pacingMs ?? 0;
  const wait = opts.wait ?? sleep;
  const handlers = createToolHandlers(deps);

  return async (tool, rawArgs) => {
    const callId = newId();
    const episodeId = deps.session.get().episodeId ?? 'manual';
    const startedMs = now();
    deps.hub.broadcast({ type: 'tool_call_start', episodeId, callId, tool, args: asRecord(rawArgs) });
    deps.hub.broadcast({ type: 'block_activity', from: 'agent', to: 'server', label: tool });

    const count = deps.session.noteToolCall(tool);
    let outcome: ToolOutcome;
    if (tool !== 'report' && count > MAX_TOOL_CALLS_PER_EPISODE) {
      outcome = { ok: false, content: [text(LIMIT_TEXT)], summary: `${tool} : limite d'appels atteinte` };
    } else {
      try {
        outcome = await handlers[tool](rawArgs);
      } catch (e) {
        log(`mcp: erreur interne dans ${tool} (${String(e)})`);
        outcome = { ok: false, content: [text(`not_available : erreur interne du serveur (${String(e)})`)], summary: `${tool} : erreur interne` };
      }
    }
    deps.session.noteToolResult(tool, outcome.ok);
    // Rythme de lecture : on complète jusqu'à `pacingMs` pour que chaque appel reste suivable à
    // l'écran. `report` clôt l'épisode : jamais retardé.
    let durationMs = now() - startedMs;
    if (tool !== 'report' && pacingMs > durationMs) {
      await wait(pacingMs - durationMs);
      durationMs = now() - startedMs;
    }
    deps.hub.broadcast({ type: 'tool_call_result', episodeId, callId, ok: outcome.ok, summary: outcome.summary, durationMs });
    deps.hub.broadcast({ type: 'block_activity', from: 'server', to: 'agent', label: outcome.summary });
    outcome.after?.();
    return outcome;
  };
}
