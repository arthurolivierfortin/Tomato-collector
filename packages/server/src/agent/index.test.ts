import { describe, expect, it } from 'vitest';
import { createDefaultWorld } from '@tomato/shared';
import type { ServerToDashboard, Tomato, WorldState } from '@tomato/shared';
import { createAgentRunner } from './index';
import type { AgentMessage, AgentSession, QueryFn } from './types';

const tomato: Tomato = {
  id: 4,
  state: 'ripe',
  ripeness: 0.95,
  positionCm: [11, -3, 39],
  radiusCm: 3,
  stem: { fromCm: [9, -2, 43], toCm: [11, -3, 42] },
  attached: true,
  visibleIn: { top: 1, front: 1, side: 1 },
};
const world: WorldState = { ...createDefaultWorld(1), tomatoes: [tomato] };

function fakeSession(): AgentSession {
  let episodeId: string | null = null;
  return {
    get: () => ({ phase: 'idle', episodeId, targetTomatoId: null }),
    startEpisode: () => {
      episodeId = 'ep-1';
    },
    endEpisode: () => {
      episodeId = null;
    },
    onPhase: () => undefined,
  };
}

interface Recorded {
  prompt: string;
  systemPrompt: unknown;
  model: string | undefined;
}

function recordingQuery(recorded: Recorded[]): QueryFn {
  return async function* (prompt, options) {
    recorded.push({ prompt, systemPrompt: options.systemPrompt, model: options.model });
    const messages: AgentMessage[] = [
      {
        type: 'assistant',
        message: { content: [{ type: 'tool_use', id: 't', name: 'mcp__robot__report', input: { outcome: 'harvested', note: 'n' } }] },
      },
    ];
    yield* messages;
  };
}

function base(recorded: Recorded[], out: ServerToDashboard[]) {
  return {
    hub: { broadcast: (m: ServerToDashboard) => out.push(m) },
    session: fakeSession(),
    mcpUrl: 'http://localhost:7331/mcp',
    model: 'claude-opus-5',
    query: recordingQuery(recorded),
    log: (): void => undefined,
  };
}

describe('createAgentRunner (contrat M5 : src/agent/index.ts)', () => {
  it('runs an episode with the packaged system prompt and the sim summary when M5 passes none', async () => {
    const recorded: Recorded[] = [];
    const out: ServerToDashboard[] = [];
    const runner = createAgentRunner({ ...base(recorded, out), systemPrompt: '', sim: { latestState: () => world }, wakePort: -1 });
    try {
      runner.wake({ tomatoId: 4, positionCm: [11, -3, 39], ripeness: 0.95 });
      await runner.whenIdle();
      expect(String(recorded[0]?.systemPrompt)).toContain('Tomato harvesting agent');
      expect(recorded[0]?.model).toBe('claude-opus-5');
      expect(recorded[0]?.prompt).toContain('1 tomatoes on the plant (ripe: #4)');
      expect(out.map((m) => m.type)).toEqual(['episode_start', 'episode_end']);
      expect(await runner.whenReady()).toEqual({ wakePort: null });
    } finally {
      runner.stop();
    }
  });

  it('keeps the system prompt given by M5 and works without a sim bridge', async () => {
    const recorded: Recorded[] = [];
    const out: ServerToDashboard[] = [];
    const runner = createAgentRunner({ ...base(recorded, out), systemPrompt: 'FROM M5', wakePort: -1 });
    try {
      runner.wake({ tomatoId: 4, positionCm: [11, -3, 39], ripeness: 0.95 });
      await runner.whenIdle();
      expect(recorded[0]?.systemPrompt).toBe('FROM M5');
      expect(recorded[0]?.prompt).toContain('no simulation state received yet');
    } finally {
      runner.stop();
    }
  });

  it('serves the manual wake endpoint on its own port and closes it on stop', async () => {
    const recorded: Recorded[] = [];
    const out: ServerToDashboard[] = [];
    const runner = createAgentRunner({ ...base(recorded, out), systemPrompt: '', sim: { latestState: () => world }, wakePort: 0 });
    const { wakePort } = await runner.whenReady();
    expect(wakePort).not.toBeNull();
    const r = await fetch(`http://127.0.0.1:${String(wakePort)}/wake/4`, { method: 'POST' });
    expect(r.status).toBe(202);
    await runner.whenIdle();
    expect(recorded.length).toBe(1);
    runner.stop();
    await runner.whenClosed();
    await expect(fetch(`http://127.0.0.1:${String(wakePort)}/wake`)).rejects.toThrow();
  });
});
