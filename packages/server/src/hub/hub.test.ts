import { createDefaultWorld, type AnyMessage, type SimToServer } from '@tomato/shared';
import { WebSocket } from 'ws';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createHub, type Hub } from './hub';

interface TestClient {
  ws: WebSocket;
  /** Prochain message reçu (dans l'ordre). */
  next(): Promise<AnyMessage>;
  send(m: unknown): void;
  close(): Promise<void>;
}

async function connect(port: number): Promise<TestClient> {
  const ws = new WebSocket(`ws://127.0.0.1:${port}`);
  const queue: AnyMessage[] = [];
  const waiters: ((m: AnyMessage) => void)[] = [];
  ws.on('message', (data) => {
    const m = JSON.parse(String(data)) as AnyMessage;
    const w = waiters.shift();
    if (w) w(m);
    else queue.push(m);
  });
  await new Promise<void>((resolve, reject) => {
    ws.once('open', resolve);
    ws.once('error', reject);
  });
  return {
    ws,
    next: () => {
      const m = queue.shift();
      return m ? Promise.resolve(m) : new Promise((resolve) => waiters.push(resolve));
    },
    send: (m) => ws.send(JSON.stringify(m)),
    close: () =>
      new Promise((resolve) => {
        ws.once('close', () => resolve());
        ws.close();
      }),
  };
}

const tick = (): Promise<void> => new Promise((r) => setTimeout(r, 20));

let hub: Hub;
let port: number;
let logs: string[];

beforeEach(async () => {
  logs = [];
  hub = createHub(0, { log: (l) => logs.push(l) });
  port = await hub.whenListening();
});

afterEach(async () => {
  await hub.close();
});

describe('hub', () => {
  it('sends the snapshot after hello and routes sim messages only from the sim client', async () => {
    const received: SimToServer[] = [];
    hub.onSimMessage((m) => received.push(m));
    hub.setSnapshot(() => ({ type: 'snapshot', state: createDefaultWorld(7), phase: 'detected', episodeId: 'ep' }));

    const sim = await connect(port);
    const dash = await connect(port);
    sim.send({ type: 'hello', role: 'sim' });
    dash.send({ type: 'hello', role: 'dashboard' });
    const s1 = await sim.next();
    const s2 = await dash.next();
    expect(s1).toMatchObject({ type: 'snapshot', phase: 'detected', episodeId: 'ep' });
    expect(s2).toMatchObject({ type: 'snapshot', state: { seed: 7 } });
    expect(hub.simConnected()).toBe(true);

    sim.send({ type: 'sim_event', event: { type: 'plant_regenerated', seed: 3 } });
    dash.send({ type: 'sim_event', event: { type: 'plant_regenerated', seed: 4 } });
    dash.send('not json');
    sim.send({ type: 'phase', phase: 'idle', reason: 'pas un message sim' });
    await tick();
    expect(received).toEqual([{ type: 'sim_event', event: { type: 'plant_regenerated', seed: 3 } }]);
    expect(logs.some((l) => l.includes('sim_event ignoré (rôle dashboard)'))).toBe(true);
    expect(logs.some((l) => l.includes('illisible'))).toBe(true);
    expect(logs.some((l) => l.includes('phase ignoré (rôle sim)'))).toBe(true);

    await sim.close();
    await dash.close();
  });

  it('broadcasts to every client, sends commands to the sim only, and reports when no sim is connected', async () => {
    const sim = await connect(port);
    const dash = await connect(port);
    sim.send({ type: 'hello', role: 'sim' });
    dash.send({ type: 'hello', role: 'dashboard' });
    await sim.next();
    await dash.next();

    const seen: unknown[] = [];
    hub.onBroadcast((m) => seen.push(m));
    hub.broadcast({ type: 'phase', phase: 'detected', reason: 'test' });
    expect(await sim.next()).toEqual({ type: 'phase', phase: 'detected', reason: 'test' });
    expect(await dash.next()).toEqual({ type: 'phase', phase: 'detected', reason: 'test' });
    expect(seen).toHaveLength(1);

    expect(hub.sendToSim({ type: 'render_views', requestId: 'r1', cameras: ['top'] })).toBe(true);
    expect(await sim.next()).toEqual({ type: 'render_views', requestId: 'r1', cameras: ['top'] });

    await sim.close();
    await tick();
    expect(hub.simConnected()).toBe(false);
    expect(hub.sendToSim({ type: 'render_views', requestId: 'r2', cameras: ['top'] })).toBe(false);
    await dash.close();
  });

  it('replaces the previous sim client when a new one says hello', async () => {
    const first = await connect(port);
    first.send({ type: 'hello', role: 'sim' });
    await first.next();
    const closed = new Promise<void>((resolve) => first.ws.once('close', () => resolve()));
    const second = await connect(port);
    second.send({ type: 'hello', role: 'sim' });
    await second.next();
    await closed;
    expect(hub.simConnected()).toBe(true);
    const received: SimToServer[] = [];
    hub.onSimMessage((m) => received.push(m));
    second.send({ type: 'state', state: createDefaultWorld(9) });
    await tick();
    expect(received[0]).toMatchObject({ type: 'state', state: { seed: 9 } });
    await second.close();
  });
});
