import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { AgentRunner, WakeEvent } from './types';
import { DEFAULT_WAKE_PORT, createWakeServer, readWakePort } from './wakeServer';
import type { WakeServer } from './wakeServer';

describe('wake server', () => {
  const woken: WakeEvent[] = [];
  let busy = false;
  const runner: AgentRunner = {
    wake: (e) => woken.push(e),
    busy: () => busy,
    stop: () => Promise.resolve(),
    whenIdle: () => Promise.resolve(),
  };
  let server: WakeServer;

  beforeAll(async () => {
    server = await createWakeServer({
      port: 0,
      runner,
      resolve: (id) => (id === 3 ? { tomatoId: 3, positionCm: [1, 2, 3], ripeness: 1, detector: 'manual', confidence: 1 } : null),
      knownIds: () => [3],
    });
  });
  afterAll(() => server.close());

  const url = (path: string): string => `http://127.0.0.1:${server.port}${path}`;

  it('queues a wake for a known tomato and reports whether an episode is running', async () => {
    const r = await fetch(url('/wake/3'), { method: 'POST' });
    expect(r.status).toBe(202);
    expect(await r.json()).toEqual({ queued: true, agent: 'on', tomatoId: 3, behindRunningEpisode: false });
    expect(woken).toEqual([{ tomatoId: 3, positionCm: [1, 2, 3], ripeness: 1, detector: 'manual', confidence: 1 }]);
    busy = true;
    const r2 = await fetch(url('/wake/3'), { method: 'POST' });
    expect(await r2.json()).toMatchObject({ behindRunningEpisode: true });
  });

  it('rejects an unknown tomato with the known ids', async () => {
    const r = await fetch(url('/wake/9'), { method: 'POST' });
    expect(r.status).toBe(404);
    expect(await r.json()).toEqual({ error: 'unknown_tomato', tomatoId: 9, known: [3] });
  });

  it('answers GET /wake with the runner state and 404 elsewhere', async () => {
    expect(await (await fetch(url('/wake'))).json()).toEqual({ busy: true, tomatoes: [3] });
    expect((await fetch(url('/other'))).status).toBe(404);
    expect((await fetch(url('/wake/3'))).status).toBe(404);
  });
});

describe('wake server with the agent off (issue #29)', () => {
  const event: WakeEvent = { tomatoId: 1, positionCm: [0, 1, 2], ripeness: 1, detector: 'manual', confidence: 1 };

  it('stages the wake on the dummy runner and says so instead of queuing an SDK episode', async () => {
    const woken: WakeEvent[] = [];
    const server = await createWakeServer({
      port: 0,
      agent: 'off',
      runner: { wake: (e) => woken.push(e), busy: () => false },
      resolve: (id) => (id === 1 ? event : null),
      knownIds: () => [1],
    });
    try {
      const r = await fetch(`http://127.0.0.1:${String(server.port)}/wake/1`, { method: 'POST' });
      expect(r.status).toBe(202);
      expect(await r.json()).toEqual({ ok: true, agent: 'off', tomatoId: 1 });
      expect(woken).toEqual([event]);
    } finally {
      await server.close();
    }
  });
});

describe('readWakePort', () => {
  it('reads TOMATO_WAKE_PORT and falls back to the default port', () => {
    expect(readWakePort({ TOMATO_WAKE_PORT: '7373' })).toBe(7373);
    expect(readWakePort({})).toBe(DEFAULT_WAKE_PORT);
    expect(readWakePort({ TOMATO_WAKE_PORT: 'nope' })).toBe(DEFAULT_WAKE_PORT);
  });
});
