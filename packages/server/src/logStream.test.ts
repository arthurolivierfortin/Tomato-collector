import { describe, expect, it } from 'vitest';
import { logStreamLine, stripAnsi } from './logStream';

/** Caractère d'échappement ANSI ; écrit par son code pour ne pas poser un caractère de contrôle dans le source. */
const ESC = String.fromCharCode(27);

describe('logStreamLine', () => {
  it('prints one line per raw SDK event, with a prefix per kind', () => {
    const line = logStreamLine({ type: 'agent_raw', episodeId: 'ep-1', kind: 'tool_use', line: 'move_basket {"x":13}' });
    expect(line).not.toBeNull();
    expect(stripAnsi(line ?? '')).toBe('tool_use  move_basket {"x":13}');
  });

  it('colours each kind differently, so the terminal reads at a glance', () => {
    const tool = logStreamLine({ type: 'agent_raw', episodeId: 'e', kind: 'tool_use', line: 'cut {}' }) ?? '';
    const err = logStreamLine({ type: 'agent_raw', episodeId: 'e', kind: 'stderr', line: 'boom' }) ?? '';
    expect(tool).toContain(ESC);
    expect(err).toContain(ESC);
    expect(tool.slice(0, 8)).not.toBe(err.slice(0, 8));
  });

  it('never leaks a base64 image into the terminal', () => {
    const big = `data ${'A'.repeat(120)} end`;
    const line = logStreamLine({ type: 'agent_raw', episodeId: 'e', kind: 'tool_result', line: big }) ?? '';
    expect(line).toContain('[base64]');
    expect(line).not.toContain('A'.repeat(70));
  });

  it('frames the episode: wake, start and end are printed too', () => {
    const wake = logStreamLine({ type: 'agent_wake', episodeId: 'ep-1', tomatoId: 1, detector: 'hsv', confidence: 0.77, sessionResumed: false });
    expect(stripAnsi(wake ?? '')).toContain('wake      tomato #1');
    const end = logStreamLine({ type: 'episode_end', episodeId: 'ep-1', outcome: 'harvested', note: 'ok', toolCalls: 12, costUsd: 0.3827, durationMs: 61_100 });
    expect(stripAnsi(end ?? '')).toBe('end       harvested · 12 tool calls · 61 s · $0.38');
  });

  it('stays silent on the messages that would drown the stream', () => {
    expect(logStreamLine({ type: 'phase', phase: 'detected', reason: 'x' })).toBeNull();
    expect(logStreamLine({ type: 'block_activity', from: 'server', to: 'agent', label: 'réveil' })).toBeNull();
  });
});
