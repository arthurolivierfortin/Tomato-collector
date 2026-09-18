import { describe, expect, it } from 'vitest';
import {
  createStreamState,
  episodeEndMessage,
  episodeOutcome,
  reduceStreamMessage,
  robotToolName,
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
    expect(out).toEqual([
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
    expect(out).toEqual([]);
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
