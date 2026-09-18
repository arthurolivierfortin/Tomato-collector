import { buildQueryOptions } from './queryOptions';
import { sdkQuery } from './sdkQuery';
import {
  createStreamState,
  episodeEndMessage,
  episodeOutcome,
  reduceStreamMessage,
} from './streamToDashboard';
import type { StreamState } from './streamToDashboard';
import type { AgentHub, AgentRunner, AgentSession, QueryFn, WakeEvent } from './types';
import { buildWakePrompt } from './wakePrompt';

export interface AgentRunnerDeps {
  hub: AgentHub;
  session: AgentSession;
  mcpUrl: string;
  model: string;
  systemPrompt: string;
  /** `query()` du SDK par défaut ; les tests injectent un générateur factice. */
  query?: QueryFn;
  /** Texte d'état joint au message de réveil (résumé de la sim). */
  statusText?: () => string;
  /** Journal console (texte en continu de l'agent, événements du runner). */
  log?: (line: string) => void;
  /** Fragments de texte en continu (console). */
  onDelta?: (text: string) => void;
}

/**
 * Runner d'agent : file de réveils, un épisode à la fois, reprise de session entre épisodes,
 * conversion du flux SDK en messages dashboard. Les `tool_call_*` viennent du MCP (M5), pas d'ici.
 */
export function createAgentRunner(deps: AgentRunnerDeps): AgentRunner {
  const queryFn = deps.query ?? sdkQuery;
  const log = deps.log ?? ((): void => undefined);
  const queue: WakeEvent[] = [];
  let running = false;
  let stopped = false;
  let currentTomato: number | null = null;
  let abort: AbortController | null = null;
  let sessionId: string | null = null;
  let idle: Promise<void> = Promise.resolve();

  async function consumeStream(prompt: string, state: StreamState): Promise<{ state: StreamState; error: string | null }> {
    abort = new AbortController();
    const options = buildQueryOptions({
      mcpUrl: deps.mcpUrl,
      model: deps.model,
      systemPrompt: deps.systemPrompt,
      sessionId,
      abortController: abort,
      stderr: (data) => log(`[claude stderr] ${data.trimEnd()}`),
    });
    try {
      for await (const msg of queryFn(prompt, options)) {
        const step = reduceStreamMessage(state, msg);
        state = step.state;
        for (const out of step.out) deps.hub.broadcast(out);
        if (step.delta !== null) deps.onDelta?.(step.delta);
        if (msg.type === 'system') log(`session ${msg.session_id} model ${msg.model} robot MCP ${state.mcpStatus ?? '?'} auth ${msg.apiKeySource}`);
      }
      return { state, error: null };
    } catch (err) {
      return { state, error: err instanceof Error ? err.message : String(err) };
    } finally {
      abort = null;
    }
  }

  async function runEpisode(event: WakeEvent): Promise<void> {
    // Posé avant `startEpisode`, qui prévient ses abonnés `onWake` (M5) et rappellerait `wake`.
    currentTomato = event.tomatoId;
    if (deps.session.get().episodeId === null) deps.session.startEpisode(event.tomatoId);
    const episodeId = deps.session.get().episodeId ?? 'manual';
    const resumed = sessionId !== null;
    deps.hub.broadcast({ type: 'episode_start', episodeId, tomatoId: event.tomatoId, sessionResumed: resumed });
    log(`episode ${episodeId} for tomato #${event.tomatoId} (${resumed ? 'resumed session' : 'new session'})`);

    const startedAt = Date.now();
    const prompt = buildWakePrompt(event, deps.statusText?.() ?? 'unknown', { resumed });
    const { state, error } = await consumeStream(prompt, createStreamState(episodeId));

    if (state.sessionId !== null && error === null && !state.result?.isError) {
      sessionId = state.sessionId;
    } else if (resumed) {
      sessionId = null;
      log('session could not be resumed cleanly; the next episode starts a fresh session');
    }
    const final = episodeOutcome(state, error);
    deps.hub.broadcast(episodeEndMessage(state, final, Date.now() - startedAt));
    if (deps.session.get().episodeId !== null) deps.session.endEpisode(final.outcome, final.note);
    log(`episode ${episodeId} ended: ${final.outcome} (${state.toolCalls} tool calls, $${(state.result?.costUsd ?? 0).toFixed(3)})`);
    currentTomato = null;
  }

  async function drain(): Promise<void> {
    running = true;
    try {
      for (let next = queue.shift(); next !== undefined && !stopped; next = queue.shift()) {
        await runEpisode(next);
      }
    } finally {
      running = false;
    }
  }

  return {
    wake(event) {
      if (stopped) return;
      if (currentTomato === event.tomatoId || queue.some((q) => q.tomatoId === event.tomatoId)) {
        log(`wake for tomato #${event.tomatoId} ignored: already in progress or queued`);
        return;
      }
      queue.push(event);
      if (!running) idle = drain();
    },
    busy: () => running,
    stop() {
      stopped = true;
      queue.length = 0;
      abort?.abort();
    },
    whenIdle: () => idle,
  };
}
