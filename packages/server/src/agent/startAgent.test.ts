import { describe, expect, it } from 'vitest';
import { createDefaultWorld } from '@tomato/shared';
import type { Phase, ServerToDashboard, Tomato, WorldState } from '@tomato/shared';
import { agentEnv, resolveWakeEvent, startAgent } from './startAgent';
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

describe('resolveWakeEvent / agentEnv', () => {
  it('builds the wake event from the latest sim state', () => {
    expect(resolveWakeEvent({ latestState: () => world }, 4)).toEqual({ tomatoId: 4, positionCm: [11, -3, 39], ripeness: 0.95 });
    expect(resolveWakeEvent({ latestState: () => world }, 5)).toBeNull();
    expect(resolveWakeEvent({ latestState: () => null }, 4)).toBeNull();
  });

  it('reads TOMATO_MODEL, TOMATO_WAKE_PORT and TOMATO_AGENT with their defaults', () => {
    expect(agentEnv({})).toEqual({ model: 'claude-opus-5', wakePort: 7333, enabled: true });
    expect(agentEnv({ TOMATO_MODEL: 'claude-sonnet-5', TOMATO_WAKE_PORT: '7444', TOMATO_AGENT: 'off' })).toEqual({
      model: 'claude-sonnet-5',
      wakePort: 7444,
      enabled: false,
    });
  });
});

describe('startAgent', () => {
  it('wakes the runner on phase detected and serves the manual wake endpoint', async () => {
    const out: ServerToDashboard[] = [];
    const listeners: Array<(p: Phase) => void> = [];
    let episodeId: string | null = null;
    let target: number | null = null;
    const session: AgentSession = {
      get: () => ({ phase: 'idle', episodeId, targetTomatoId: target }),
      startEpisode: () => {
        episodeId = 'ep-x';
      },
      endEpisode: () => {
        episodeId = null;
      },
      onPhase: (fn) => listeners.push(fn),
    };
    const prompts: string[] = [];
    const query: QueryFn = async function* (prompt) {
      prompts.push(prompt);
      const messages: AgentMessage[] = [
        { type: 'assistant', message: { content: [{ type: 'tool_use', id: 't', name: 'mcp__robot__report', input: { outcome: 'harvested', note: 'n' } }] } },
      ];
      yield* messages;
    };
    const handle = await startAgent({
      hub: { broadcast: (m) => out.push(m) },
      session,
      sim: { latestState: () => world },
      mcpUrl: 'http://localhost:7331/mcp',
      wakePort: 0,
      query,
      log: () => undefined,
    });
    try {
      target = 4;
      for (const fn of listeners) fn('detected');
      await handle.runner.whenIdle();
      expect(prompts[0]).toContain('tomato #4 at X 11.0, Y -3.0, Z 39.0 cm');
      expect(prompts[0]).toContain('1 tomatoes on the plant (ripe: #4)');
      expect(out.map((m) => m.type)).toEqual(['episode_start', 'episode_end']);

      const r = await fetch(`http://127.0.0.1:${handle.wakePort}/wake/4`, { method: 'POST' });
      expect(r.status).toBe(202);
      await handle.runner.whenIdle();
      expect(prompts.length).toBe(2);
    } finally {
      await handle.close();
    }
  });
});
