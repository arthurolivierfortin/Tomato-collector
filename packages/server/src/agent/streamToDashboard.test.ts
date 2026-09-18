import { describe, expect, it } from 'vitest';
import {
  createStreamState,
  episodeEndMessage,
  episodeOutcome,
  reduceStreamMessage,
  RAW_LINE_MAX,
  robotToolName,
  stderrLines,
  stripBase64,
} from './streamToDashboard';
import type { StreamState } from './streamToDashboard';
import type { AgentMessage } from './types';

// Formes vérifiées sur sdk.d.ts (@anthropic-ai/claude-agent-sdk 0.3.275) :
// SDKSystemMessage (init), SDKAssistantMessage.message.content, SDKPartialAssistantMessage.event,
// SDKResultSuccess / SDKResultError.
const init: AgentMessage = {
  type: 'system',
  subtype: 'init',
  session_id: 'sess-1',
  model: 'claude-opus-5',
  mcp_servers: [{ name: 'robot', status: 'connected' }],
  apiKeySource: 'none',
};
const text = (t: string): AgentMessage => ({ type: 'assistant', message: { content: [{ type: 'text', text: t }] } });
const toolUse = (name: string, input: unknown): AgentMessage => ({
  type: 'assistant',
  message: { content: [{ type: 'tool_use', id: 'toolu_1', name, input }] },
});
const delta = (t: string): AgentMessage => ({
  type: 'stream_event',
  event: { type: 'content_block_delta', delta: { type: 'text_delta', text: t } },
});
const result: AgentMessage = {
  type: 'result',
  subtype: 'success',
  is_error: false,
  total_cost_usd: 0.42,
  duration_ms: 12345,
  num_turns: 7,
  session_id: 'sess-1',
};

const toolResult = (content: unknown, isError = false): AgentMessage => ({
  type: 'user',
  message: { content: [{ type: 'tool_result', tool_use_id: 'toolu_1', content, is_error: isError }] },
});

/** Les lignes `agent_raw` d'un flux, sous la forme compacte `kind: line`. */
function rawLines(out: unknown[]): string[] {
  return (out as { type: string; kind?: string; line?: string }[])
    .filter((m) => m.type === 'agent_raw')
    .map((m) => `${String(m.kind)}: ${String(m.line)}`);
}

function run(messages: AgentMessage[]): { state: StreamState; out: unknown[]; deltas: string[] } {
  let state = createStreamState('ep-1');
  const out: unknown[] = [];
  const deltas: string[] = [];
  for (const m of messages) {
    const step = reduceStreamMessage(state, m);
    state = step.state;
    out.push(...step.out);
    if (step.delta !== null) deltas.push(step.delta);
  }
  return { state, out, deltas };
}

describe('robotToolName', () => {
  it('strips the mcp__robot__ prefix and rejects other tools', () => {
    expect(robotToolName('mcp__robot__cut')).toBe('cut');
    expect(robotToolName('mcp__robot__get_views')).toBe('get_views');
    expect(robotToolName('mcp__robot__unknown')).toBeNull();
    expect(robotToolName('mcp__other__cut')).toBeNull();
    expect(robotToolName('Bash')).toBeNull();
  });
});

describe('reduceStreamMessage', () => {
  it('records the session id, model and robot MCP status from the init message', () => {
    const { state } = run([init]);
    expect(state.sessionId).toBe('sess-1');
    expect(state.model).toBe('claude-opus-5');
    expect(state.mcpStatus).toBe('connected');
  });

  it('emits one agent_text per non-empty text block, trimmed', () => {
    const { out } = run([text('  Tomato #3 at X 12.0.  '), text('   '), text('Moving basket.')]);
    expect(out.filter((m) => (m as { type: string }).type === 'agent_text')).toEqual([
      { type: 'agent_text', episodeId: 'ep-1', text: 'Tomato #3 at X 12.0.' },
      { type: 'agent_text', episodeId: 'ep-1', text: 'Moving basket.' },
    ]);
  });

  it('forwards text deltas separately and never as dashboard messages', () => {
    const { out, deltas } = run([delta('Tom'), delta('ato'), delta('')]);
    expect(out).toEqual([]);
    expect(deltas).toEqual(['Tom', 'ato']);
  });

  it('counts robot tool calls and ignores foreign tools', () => {
    const { state, out } = run([
      toolUse('mcp__robot__get_views', {}),
      toolUse('mcp__robot__move_basket', { x: 1, y: 2, mode: 'absolute' }),
      toolUse('Read', { file_path: 'x' }),
    ]);
    expect(state.toolCalls).toBe(2);
    expect(out.filter((m) => (m as { type: string }).type !== 'agent_raw')).toEqual([]);
  });

  it('detects a valid report call and keeps outcome and note', () => {
    const { state } = run([toolUse('mcp__robot__report', { outcome: 'harvested', note: 'clean cut' })]);
    expect(state.report).toEqual({ outcome: 'harvested', note: 'clean cut' });
    expect(state.toolCalls).toBe(1);
  });

  it('ignores a report call with invalid arguments', () => {
    const { state } = run([toolUse('mcp__robot__report', { outcome: 'done' })]);
    expect(state.report).toBeNull();
  });

  it('extracts cost, duration, turns and error flag from the result message', () => {
    const { state } = run([init, result]);
    expect(state.result).toEqual({ subtype: 'success', isError: false, costUsd: 0.42, durationMs: 12345, numTurns: 7 });
  });
});

describe('episodeOutcome and episodeEndMessage', () => {
  it('uses the report when present', () => {
    const { state } = run([init, toolUse('mcp__robot__report', { outcome: 'missed', note: 'basket 5 cm off' }), result]);
    expect(episodeOutcome(state, null)).toEqual({ outcome: 'missed', note: 'basket 5 cm off' });
    expect(episodeEndMessage(state, episodeOutcome(state, null), 999)).toEqual({
      type: 'episode_end',
      episodeId: 'ep-1',
      outcome: 'missed',
      note: 'basket 5 cm off',
      toolCalls: 1,
      costUsd: 0.42,
      durationMs: 12345,
    });
  });

  it('is aborted without report, with the SDK error subtype or the thrown error', () => {
    const errored: AgentMessage = { ...result, subtype: 'error_max_turns', is_error: true };
    expect(episodeOutcome(run([errored]).state, null)).toEqual({ outcome: 'aborted', note: 'agent ended with error_max_turns' });
    expect(episodeOutcome(run([]).state, 'ECONNREFUSED')).toEqual({ outcome: 'aborted', note: 'agent error: ECONNREFUSED' });
    expect(episodeOutcome(run([result]).state, null)).toEqual({ outcome: 'aborted', note: 'agent ended without report' });
  });

  it('falls back to the measured duration and zero cost without a result message', () => {
    const state = run([text('hello')]).state;
    const end = episodeEndMessage(state, episodeOutcome(state, null), 4321);
    expect(end).toMatchObject({ type: 'episode_end', costUsd: 0, durationMs: 4321, toolCalls: 0 });
  });
});

describe('agent_raw (issue #23)', () => {
  it('opens the raw stream with the session, the model and the robot MCP status', () => {
    const { out } = run([init]);
    expect(out).toEqual([
      { type: 'agent_raw', episodeId: 'ep-1', kind: 'init', line: 'session sess-1 · modèle claude-opus-5 · MCP robot : connected' },
    ]);
  });

  it('prints every tool_use with its arguments as compact one-line JSON, foreign tools included', () => {
    const { out } = run([
      toolUse('mcp__robot__move_basket', { x: 1.5, y: -2, mode: 'absolute' }),
      toolUse('Read', { file_path: 'x' }),
    ]);
    expect(rawLines(out)).toEqual([
      'tool_use: move_basket {"x":1.5,"y":-2,"mode":"absolute"}',
      'tool_use: Read {"file_path":"x"}',
    ]);
  });

  it('previews the agent text on one line, the full text staying in agent_text', () => {
    expect(rawLines(run([text('  Je vise la tomate #3.\nPuis je coupe.  ')]).out)).toEqual([
      'text: Je vise la tomate #3. Puis je coupe.',
    ]);
    // Mots séparés : une longue suite de lettres collées passerait pour du base64 et serait masquée.
    const long = 'tomate '.repeat(40).trim();
    const { out } = run([text(long)]);
    expect(rawLines(out)).toEqual([`text: ${long.slice(0, RAW_LINE_MAX)}… (+${long.length - RAW_LINE_MAX} car.)`]);
    expect(out.filter((m) => (m as { type: string }).type === 'agent_text')).toEqual([
      { type: 'agent_text', episodeId: 'ep-1', text: long },
    ]);
  });

  it('summarizes tool results and never lets base64 through', () => {
    const png = `data:image/png;base64,${'QUJDRA'.repeat(40)}`;
    expect(rawLines(run([toolResult('top view ok')]).out)).toEqual(['tool_result: top view ok']);
    expect(rawLines(run([toolResult([{ type: 'text', text: png }])]).out)[0]).not.toContain('QUJDRA');
    expect(rawLines(run([toolResult([{ type: 'text', text: png }])]).out)[0]).toContain('[base64]');
    expect(rawLines(run([toolResult([{ type: 'image', source: { data: 'QUJD' } }])]).out)).toEqual(['tool_result: [image]']);
    expect(rawLines(run([toolResult('out of reach', true)]).out)).toEqual(['tool_result: ERREUR out of reach']);
  });

  it('closes the raw stream with the turns, the cost and the duration', () => {
    expect(rawLines(run([init, result]).out).at(-1)).toBe('result: terminé · 7 tours · 0,420 $ · 12 s');
    const errored: AgentMessage = { ...result, subtype: 'error_max_turns', is_error: true };
    expect(rawLines(run([errored]).out).at(-1)).toBe('result: échec error_max_turns · 7 tours · 0,420 $ · 12 s');
  });

  it('splits subprocess stderr into non-empty lines', () => {
    expect(stderrLines('warn: a\nwarn: b\n\n')).toEqual(['warn: a', 'warn: b']);
    expect(stderrLines('   \n')).toEqual([]);
  });

  it('replaces long base64 runs wherever they appear', () => {
    expect(stripBase64('x QUJDRFVX0123456789abcdefghijABCDEFGHIJ0123456789abcdefghijABCDEFGHIJ y')).toBe('x [base64] y');
    expect(stripBase64('short abc')).toBe('short abc');
  });
});
