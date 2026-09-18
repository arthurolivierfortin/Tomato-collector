import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { AgentRunner, WakeEvent } from './types';
import { createWakeServer } from './wakeServer';
import type { WakeServer } from './wakeServer';

describe('wake server', () => {
  const woken: WakeEvent[] = [];
  let busy = false;
  const runner: AgentRunner = {
    wake: (e) => woken.push(e),
    busy: () => busy,
    stop: () => undefined,
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
    expect(await r.json()).toEqual({ queued: true, tomatoId: 3, behindRunningEpisode: false });
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
