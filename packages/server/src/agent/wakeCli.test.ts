import { describe, expect, it } from 'vitest';
import { EPISODES_DIR, formatTraceLine, transcriptPath, wakeFollowUp } from './wakeCli';

describe('wake CLI formatting', () => {
  it('formats the messages that matter for a console transcript', () => {
    expect(formatTraceLine({ type: 'episode_start', episodeId: 'e1', tomatoId: 3, sessionResumed: true })).toBe(
      '== episode e1 tomato #3 (resumed session)',
    );
    expect(formatTraceLine({ type: 'agent_text', episodeId: 'e1', text: 'Looking.' })).toBe('[agent] Looking.');
    expect(formatTraceLine({ type: 'tool_call_start', episodeId: 'e1', callId: 'c', tool: 'cut', args: {} })).toBe('[tool ] cut {}');
    expect(formatTraceLine({ type: 'tool_call_result', episodeId: 'e1', callId: 'c', ok: false, summary: 'misaligned', durationMs: 12 })).toBe(
      '[ERROR] misaligned (12 ms)',
    );
    expect(formatTraceLine({ type: 'phase', phase: 'falling', reason: 'cut' })).toBe('[phase] falling (cut)');
    expect(
      formatTraceLine({ type: 'episode_end', episodeId: 'e1', outcome: 'harvested', note: 'n', toolCalls: 9, costUsd: 0.5, durationMs: 61000 }),
    ).toBe('== end harvested: n (9 tool calls, $0.500, 61 s)');
  });

  it('prints the wake and the raw session stream (issue #23)', () => {
    expect(
      formatTraceLine({ type: 'agent_wake', episodeId: 'e1', tomatoId: 3, detector: 'yolo', confidence: 0.56, sessionResumed: false }),
    ).toBe('== réveil tomate #3 (yolo 0,56, nouvelle session)');
    expect(formatTraceLine({ type: 'agent_raw', episodeId: 'e1', kind: 'tool_use', line: 'cut {}' })).toBe('[raw  ] tool_use cut {}');
  });

  it('ignores snapshots, views and block activity', () => {
    expect(formatTraceLine({ type: 'block_activity', from: 'server', to: 'agent', label: 'x' })).toBeNull();
  });

  it('writes transcripts under data/episodes at the repository root', () => {
    expect(EPISODES_DIR.replace(/\\/g, '/')).toMatch(/\/data\/episodes\/$/);
    expect(transcriptPath(3, new Date('2026-09-17T10:20:30.000Z')).replace(/\\/g, '/')).toMatch(/data\/episodes\/wake-3-2026-09-17T10-20-30-000Z\.log$/);
  });
});

describe('wake CLI follow-up (issue #29)', () => {
  it('follows the episode when the agent took it, stops after a staged wake, fails otherwise', () => {
    expect(wakeFollowUp(202, { queued: true, agent: 'on', tomatoId: 3, behindRunningEpisode: false })).toBe('follow');
    expect(wakeFollowUp(202, { ok: true, agent: 'off', tomatoId: 3 })).toBe('staged');
    expect(wakeFollowUp(404, { error: 'unknown_tomato', tomatoId: 9, known: [3] })).toBe('error');
    expect(wakeFollowUp(202, 'pas du JSON')).toBe('follow');
  });
});
