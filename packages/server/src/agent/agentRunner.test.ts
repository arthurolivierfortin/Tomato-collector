import { describe, expect, it } from 'vitest';
import type { Phase, ServerToDashboard } from '@tomato/shared';
import { createAgentRunner } from './agentRunner';
import type { AgentMessage, AgentSession, QueryFn, WakeEvent } from './types';

interface Call {
  prompt: string;
  resume: string | undefined;
}

/** Faux `query()` : rejoue un script de messages par appel, ou lève si le script est une erreur. */
function fakeQuery(scripts: Array<AgentMessage[] | Error>, opts: { gate?: () => Promise<void> } = {}) {
  const calls: Call[] = [];
  const query: QueryFn = async function* (prompt, options) {
    calls.push({ prompt, resume: options.resume });
    const script = scripts[calls.length - 1] ?? [];
    if (script instanceof Error) throw script;
    for (const m of script) {
      await opts.gate?.();
      if (options.abortController?.signal.aborted) throw new Error('aborted');
      yield m;
    }
  };
  return { query, calls };
}

/** Faux `Session` de M5 : `startEpisode` pose la cible et prévient `onWake`, `endEpisode` la libère. */
function fakeSession(opts: { onStart?: (tomatoId: number) => void; onEnd?: () => void } = {}) {
  let episodeId: string | null = null;
  let targetTomatoId: number | null = null;
  let n = 0;
  const ended: Array<{ outcome: string; note: string }> = [];
  const listeners: Array<(p: Phase) => void> = [];
  const session: AgentSession = {
    get: () => ({ phase: episodeId === null ? 'idle' : 'detected', episodeId, targetTomatoId }),
    startEpisode: (tomatoId) => {
      episodeId = `ep-${++n}`;
      targetTomatoId = tomatoId;
      opts.onStart?.(tomatoId);
    },
    endEpisode: (outcome, note) => {
      ended.push({ outcome, note });
      episodeId = null;
      targetTomatoId = null;
      opts.onEnd?.();
    },
    onPhase: (fn) => listeners.push(fn),
  };
  return { session, ended, isOpen: () => episodeId !== null };
}

const init = (sessionId: string): AgentMessage => ({
  type: 'system',
  subtype: 'init',
  session_id: sessionId,
  model: 'claude-opus-5',
  mcp_servers: [{ name: 'robot', status: 'connected' }],
  apiKeySource: 'none',
});
const text = (t: string): AgentMessage => ({ type: 'assistant', message: { content: [{ type: 'text', text: t }] } });
const report = (outcome: 'harvested' | 'missed' | 'aborted'): AgentMessage => ({
  type: 'assistant',
  message: { content: [{ type: 'tool_use', id: 't1', name: 'mcp__robot__report', input: { outcome, note: 'ok' } }] },
});
const result = (sessionId: string, isError = false): AgentMessage => ({
  type: 'result',
  subtype: isError ? 'error_during_execution' : 'success',
  is_error: isError,
  total_cost_usd: 0.1,
  duration_ms: 500,
  num_turns: 3,
  session_id: sessionId,
});
const wake = (tomatoId: number, detector: WakeEvent['detector'] = 'yolo', confidence = 0.56): WakeEvent => ({
  tomatoId, positionCm: [1, 2, 3], ripeness: 1, detector, confidence,
});

function setup(scripts: Array<AgentMessage[] | Error>, gate?: () => Promise<void>) {
  const out: ServerToDashboard[] = [];
  const { query, calls } = fakeQuery(scripts, gate === undefined ? {} : { gate });
  const s = fakeSession();
  const runner = createAgentRunner({
    hub: { broadcast: (m) => out.push(m) },
    session: s.session,
    mcpUrl: 'http://localhost:7331/mcp',
    model: 'claude-opus-5',
    systemPrompt: 'SYS',
    query,
    statusText: () => 'status',
  });
  return { runner, out, calls, ...s };
}

describe('createAgentRunner', () => {
  it('runs an episode: starts it, streams text, and ends with the reported outcome', async () => {
    const t = setup([[init('s1'), text('Looking.'), report('harvested'), result('s1')]]);
    t.runner.wake(wake(3));
    expect(t.runner.busy()).toBe(true);
    await t.runner.whenIdle();
    expect(t.runner.busy()).toBe(false);
    expect(t.out.filter((m) => m.type !== 'agent_raw').map((m) => m.type)).toEqual([
      'agent_wake', 'episode_start', 'agent_text', 'episode_end',
    ]);
    expect(t.out[0]).toEqual({
      type: 'agent_wake', episodeId: 'ep-1', tomatoId: 3, detector: 'yolo', confidence: 0.56, sessionResumed: false,
    });
    expect(t.out[1]).toEqual({ type: 'episode_start', episodeId: 'ep-1', tomatoId: 3, sessionResumed: false });
    expect(t.out.at(-1)).toMatchObject({ type: 'episode_end', episodeId: 'ep-1', outcome: 'harvested', toolCalls: 1, costUsd: 0.1, durationMs: 500 });
    expect(t.calls[0]?.prompt).toContain('tomato #3');
    expect(t.calls[0]?.resume).toBeUndefined();
    expect(t.ended).toEqual([{ outcome: 'harvested', note: 'ok' }]);
  });

  it('resumes the session on the next episode and says so in the prompt', async () => {
    const t = setup([
      [init('s1'), report('missed'), result('s1')],
      [init('s1'), report('harvested'), result('s1')],
    ]);
    t.runner.wake(wake(1));
    await t.runner.whenIdle();
    t.runner.wake(wake(2));
    await t.runner.whenIdle();
    expect(t.calls[1]?.resume).toBe('s1');
    expect(t.calls[1]?.prompt.startsWith('New episode.')).toBe(true);
    expect(t.out.filter((m) => m.type === 'episode_start')[1]).toMatchObject({ sessionResumed: true });
  });

  it('queues a wake received during an episode and ignores duplicates', async () => {
    let release: () => void = () => undefined;
    const gate = new Promise<void>((r) => (release = r));
    const t = setup([[init('s1'), report('harvested'), result('s1')], [init('s1'), report('harvested'), result('s1')]], () => gate);
    t.runner.wake(wake(1));
    t.runner.wake(wake(2));
    t.runner.wake(wake(2));
    t.runner.wake(wake(1));
    release();
    await t.runner.whenIdle();
    expect(t.calls.length).toBe(2);
    expect(t.out.filter((m) => m.type === 'episode_start').map((m) => (m.type === 'episode_start' ? m.tomatoId : -1))).toEqual([1, 2]);
  });

  it('ignores the wake re-emitted synchronously by startEpisode for the same tomato', async () => {
    const out: ServerToDashboard[] = [];
    const { query: base, calls } = fakeQuery([[init('s1'), report('harvested'), result('s1')]]);
    // Garde-fou : si la régression revient, le runner reboucle. On l'arrête au 2e épisode
    // pour que le test échoue par assertion (`2 to be 1`) plutôt qu'en bloquant le worker.
    const query: QueryFn = (prompt, options) => {
      if (calls.length >= 1) void runner.stop();
      return base(prompt, options);
    };
    // M5 : `session.startEpisode` prévient ses abonnés `onWake`, qui rappellent `runner.wake`.
    const s = fakeSession({ onStart: (tomatoId) => runner.wake({ tomatoId, positionCm: [1, 2, 3], ripeness: 1, detector: 'hsv', confidence: 0.7 }) });
    const runner = createAgentRunner({
      hub: { broadcast: (m) => out.push(m) },
      session: s.session,
      mcpUrl: 'http://localhost:7331/mcp',
      model: 'claude-opus-5',
      systemPrompt: 'SYS',
      query,
    });
    runner.wake(wake(7));
    await runner.whenIdle();
    expect(calls.length).toBe(1);
    expect(out.filter((m) => m.type === 'episode_start').length).toBe(1);
  });

  it('plays the episode M5 already opened rather than an older queued wake', async () => {
    const out: ServerToDashboard[] = [];
    let release: () => void = () => undefined;
    const gate = new Promise<void>((r) => (release = r));
    const { query, calls } = fakeQuery(
      [
        [init('s1'), report('harvested'), result('s1')],
        [init('s1'), report('harvested'), result('s1')],
        [init('s1'), report('harvested'), result('s1')],
      ],
      { gate: () => gate },
    );
    // M5 : `endEpisode` rejoue une détection en attente (#4) via `startEpisode`, donc via `onWake`.
    const pending = [4];
    const s = fakeSession({
      onStart: (tomatoId) => runner.wake(wake(tomatoId)),
      onEnd: () => {
        const next = pending.shift();
        if (next !== undefined) s.session.startEpisode(next);
      },
    });
    const runner = createAgentRunner({
      hub: { broadcast: (m) => out.push(m) },
      session: s.session,
      mcpUrl: 'http://localhost:7331/mcp',
      model: 'claude-opus-5',
      systemPrompt: 'SYS',
      query,
    });
    runner.wake(wake(1));
    runner.wake(wake(9)); // réveil manuel POST /wake/9 pendant l'épisode de #1
    release();
    await runner.whenIdle();
    expect(calls.length).toBe(3);
    const starts = out.filter((m) => m.type === 'episode_start');
    // #4 passe devant #9 : son épisode (ep-2) est déjà ouvert par M5.
    expect(starts.map((m) => (m.type === 'episode_start' ? [m.episodeId, m.tomatoId] : []))).toEqual([
      ['ep-1', 1],
      ['ep-2', 4],
      ['ep-3', 9],
    ]);
  });

  it('ends the episode as aborted when the agent stops without report', async () => {
    const t = setup([[init('s1'), text('Giving up.'), result('s1')]]);
    t.runner.wake(wake(5));
    await t.runner.whenIdle();
    expect(t.ended).toEqual([{ outcome: 'aborted', note: 'agent ended without report' }]);
    expect(t.out.at(-1)).toMatchObject({ type: 'episode_end', outcome: 'aborted' });
  });

  it('survives a thrown query, reports aborted and drops a failed resume', async () => {
    const t = setup([[init('s1'), report('harvested'), result('s1')], new Error('resume failed'), [init('s2'), report('harvested'), result('s2')]]);
    t.runner.wake(wake(1));
    await t.runner.whenIdle();
    t.runner.wake(wake(2));
    await t.runner.whenIdle();
    expect(t.out.at(-1)).toMatchObject({ type: 'episode_end', outcome: 'aborted', note: 'agent error: resume failed' });
    expect(t.isOpen()).toBe(false);
    t.runner.wake(wake(3));
    await t.runner.whenIdle();
    expect(t.calls[2]?.resume).toBeUndefined();
  });

  it('broadcasts the raw stream of the session and the wake, manual wakes included (issue #23)', async () => {
    const t = setup([[init('s1'), text('Je vise.'), report('harvested'), result('s1')]]);
    t.runner.wake(wake(3, 'manual', 1));
    await t.runner.whenIdle();
    const raw = t.out.filter((m) => m.type === 'agent_raw');
    expect(raw.map((m) => (m.type === 'agent_raw' ? m.kind : ''))).toEqual(['init', 'text', 'tool_use', 'result']);
    expect(raw.every((m) => m.type === 'agent_raw' && m.episodeId === 'ep-1')).toBe(true);
    expect(t.out[0]).toEqual({
      type: 'agent_wake', episodeId: 'ep-1', tomatoId: 3, detector: 'manual', confidence: 1, sessionResumed: false,
    });
  });

  it('forwards the subprocess stderr to the raw stream, line by line', async () => {
    const out: ServerToDashboard[] = [];
    const lines: string[] = [];
    const query: QueryFn = async function* (_prompt, options) {
      options.stderr?.('boom: 1\nboom: 2\n');
      yield init('s1');
      yield result('s1');
    };
    const runner = createAgentRunner({
      hub: { broadcast: (m) => out.push(m) },
      session: fakeSession().session,
      mcpUrl: 'http://localhost:7331/mcp',
      model: 'claude-opus-5',
      systemPrompt: 'SYS',
      query,
      log: (l) => lines.push(l),
    });
    runner.wake(wake(1));
    await runner.whenIdle();
    expect(out.filter((m) => m.type === 'agent_raw' && m.kind === 'stderr')).toEqual([
      { type: 'agent_raw', episodeId: 'ep-1', kind: 'stderr', line: 'boom: 1' },
      { type: 'agent_raw', episodeId: 'ep-1', kind: 'stderr', line: 'boom: 2' },
    ]);
    expect(lines.some((l) => l.includes('[claude stderr]'))).toBe(true);
  });

  /**
   * Flux factice qui s'arrête juste après le `report` : `result` (le coût) arrive après
   * `resultDelayMs`, ou jamais si `null`. `reached` retombe quand le `report` est consommé.
   */
  function reportThenResult(resultDelayMs: number | null) {
    let atReport: () => void = () => undefined;
    const reached = new Promise<void>((r) => (atReport = r));
    const query: QueryFn = async function* (_prompt, options) {
      yield init('s1');
      yield report('harvested');
      atReport();
      if (resultDelayMs === null) {
        await new Promise<void>((r) => options.abortController?.signal.addEventListener('abort', () => r()));
        throw new Error('aborted');
      }
      await new Promise<void>((r) => setTimeout(r, resultDelayMs));
      if (options.abortController?.signal.aborted) throw new Error('aborted');
      yield result('s1');
    };
    return { query, reached };
  }

  function stoppableRunner(query: QueryFn, stopDrainMs: number) {
    const out: ServerToDashboard[] = [];
    const s = fakeSession();
    const runner = createAgentRunner({
      hub: { broadcast: (m) => out.push(m) },
      session: s.session,
      mcpUrl: 'http://localhost:7331/mcp',
      model: 'claude-opus-5',
      systemPrompt: 'SYS',
      query,
      stopDrainMs,
    });
    return { runner, out };
  }

  it('stop() lets the SDK deliver its result after a report, so the cost is journalled', async () => {
    const { query, reached } = reportThenResult(100);
    const t = stoppableRunner(query, 5000);
    t.runner.wake(wake(1));
    await reached;
    await t.runner.stop();
    expect(t.out.at(-1)).toMatchObject({ type: 'episode_end', outcome: 'harvested', costUsd: 0.1, durationMs: 500 });
  });

  it('stop() gives the hand back after the drain delay when the stream never answers', async () => {
    const { query, reached } = reportThenResult(null);
    const t = stoppableRunner(query, 60);
    t.runner.wake(wake(1));
    await reached;
    const startedAt = Date.now();
    await t.runner.stop();
    expect(Date.now() - startedAt).toBeGreaterThanOrEqual(50);
    await t.runner.whenIdle();
    // L'épisode est bien clos, mais sans message `result` : aucun coût à journaliser.
    expect(t.out.at(-1)).toMatchObject({ type: 'episode_end', costUsd: 0 });
  });

  it('stop() aborts the current episode, clears the queue and refuses new wakes', async () => {
    let release: () => void = () => undefined;
    const gate = new Promise<void>((r) => (release = r));
    const t = setup([[init('s1'), text('a'), text('b'), report('harvested'), result('s1')]], () => gate);
    t.runner.wake(wake(1));
    t.runner.wake(wake(2));
    await t.runner.stop();
    release();
    await t.runner.whenIdle();
    expect(t.calls.length).toBe(1);
    expect(t.out.at(-1)).toMatchObject({ type: 'episode_end', outcome: 'aborted' });
    t.runner.wake(wake(3));
    expect(t.runner.busy()).toBe(false);
  });
});
