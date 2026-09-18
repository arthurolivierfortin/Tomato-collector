import { mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { WakeEvent } from './types';
import { EPISODES_DIR, formatTraceLine, runWakeCli, transcriptPath, wakeFollowUp } from './wakeCli';
import { createWakeServer } from './wakeServer';

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

describe('runWakeCli with the agent off (issue #29)', () => {
  /** Un port fermé : celui d'un serveur ouvert puis refermé. */
  async function closedPort(): Promise<number> {
    const server = createServer();
    const port = await new Promise<number>((done) => {
      server.listen(0, '127.0.0.1', () => {
        const a = server.address();
        done(typeof a === 'object' && a !== null ? a.port : 0);
      });
    });
    await new Promise<void>((done) => server.close(() => done()));
    return port;
  }

  it('stages the wake and returns 0 without waiting for an episode end, hub reachable or not', async () => {
    const woken: WakeEvent[] = [];
    const wake = await createWakeServer({
      port: 0,
      agent: 'off',
      runner: { wake: (e) => woken.push(e), busy: () => false },
      resolve: (id) => (id === 1 ? { tomatoId: 1, positionCm: [0, 0, 0], ripeness: 1, detector: 'manual', confidence: 1 } : null),
      knownIds: () => [1],
    });
    const dir = mkdtempSync(join(tmpdir(), 'tomato-wake-'));
    try {
      const code = await runWakeCli(['1'], {
        TOMATO_WAKE_PORT: String(wake.port),
        TOMATO_WS_PORT: String(await closedPort()),
        TOMATO_EPISODES_DIR: dir,
      });
      expect(code).toBe(0);
      expect(woken).toHaveLength(1);
      expect(readdirSync(dir).filter((f) => f.startsWith('wake-1-'))).toHaveLength(1);
    } finally {
      rmSync(dir, { recursive: true, force: true });
      await wake.close();
    }
  });
});
