import { createDefaultWorld, type ServerToDashboard, type SimToServer, type ViewsResult } from '@tomato/shared';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createRuntime, type SimRuntime } from '../core/runtime';
import { RECONNECT_MS, STATE_INTERVAL_MS, createBridge, type Bridge, type BridgeStatus, type SocketLike } from './bridge';

class FakeSocket implements SocketLike {
  static instances: FakeSocket[] = [];
  readyState = 0;
  sent: SimToServer[] = [];
  onopen: (() => void) | null = null;
  onmessage: ((ev: { data: unknown }) => void) | null = null;
  onclose: (() => void) | null = null;
  onerror: (() => void) | null = null;

  constructor(readonly url: string) {
    FakeSocket.instances.push(this);
  }
  open(): void {
    this.readyState = 1;
    this.onopen?.();
  }
  receive(m: unknown): void {
    this.onmessage?.({ data: typeof m === 'string' ? m : JSON.stringify(m) });
  }
  /** Coupure côté serveur. */
  drop(): void {
    this.readyState = 3;
    this.onerror?.();
    this.onclose?.();
  }
  send(data: string): void {
    this.sent.push(JSON.parse(data) as SimToServer);
  }
  close(): void {
    this.readyState = 3;
    this.onclose?.();
  }
  types(): string[] {
    return this.sent.map((m) => m.type);
  }
}

const views = (): Promise<ViewsResult> =>
  Promise.resolve({ images: [{ camera: 'front', pngBase64: 'iVBOR', widthPx: 800, heightPx: 800 }], json: { ...createDefaultWorld(1), tomatoes: [] } });

let runtime: SimRuntime;
let bridge: Bridge;
let statuses: BridgeStatus[];

function socket(): FakeSocket {
  return FakeSocket.instances.at(-1)!;
}

beforeEach(async () => {
  vi.useFakeTimers();
  FakeSocket.instances = [];
  runtime = await createRuntime(createDefaultWorld(1), null, []);
  bridge = createBridge({ url: 'ws://test', runtime, renderViews: views, socketFactory: (url) => new FakeSocket(url) });
  statuses = [];
  bridge.onStatus((s) => statuses.push(s));
});

afterEach(() => {
  bridge.close();
  vi.useRealTimers();
});

describe('sim bridge', () => {
  it('says hello as sim, then sends the state, and reports its status', () => {
    expect(bridge.status()).toBe('disconnected');
    expect(socket().url).toBe('ws://test');
    socket().open();
    expect(bridge.status()).toBe('connected');
    expect(statuses).toEqual(['connected']);
    expect(socket().sent[0]).toEqual({ type: 'hello', role: 'sim' });
    expect(socket().sent[1]).toMatchObject({ type: 'state', state: { seed: 1 } });
  });

  it('answers apply_action with action_result (same requestId) followed by a fresh state', () => {
    socket().open();
    socket().receive({ type: 'apply_action', requestId: 'r1', action: { type: 'set_paused', paused: true } });
    const [, , result, state] = socket().sent;
    expect(result).toMatchObject({ type: 'action_result', requestId: 'r1', result: { ok: true, message: 'paused' } });
    expect(state).toMatchObject({ type: 'state', state: { paused: true } });
    expect(runtime.ctx.store.get().paused).toBe(true);
  });

  it('answers render_views with views_result, or an empty result when rendering fails', async () => {
    socket().open();
    socket().receive({ type: 'render_views', requestId: 'v1', cameras: ['front'] });
    await vi.advanceTimersByTimeAsync(0);
    expect(socket().sent.at(-1)).toMatchObject({ type: 'views_result', requestId: 'v1', result: { images: [{ camera: 'front' }] } });

    bridge.close();
    bridge = createBridge({ url: 'ws://test', runtime, renderViews: () => Promise.reject(new Error('no webgl')), socketFactory: (url) => new FakeSocket(url) });
    socket().open();
    socket().receive({ type: 'render_views', requestId: 'v2', cameras: ['top'] });
    await vi.advanceTimersByTimeAsync(0);
    expect(socket().sent.at(-1)).toMatchObject({ type: 'views_result', requestId: 'v2', result: { images: [] } });
  });

  it('throttles state updates to 5 Hz, keeping the last one', () => {
    socket().open();
    const before = socket().sent.length;
    for (let i = 1; i <= 5; i++) runtime.ctx.store.update((s) => ({ ...s, simTimeS: i }));
    expect(socket().types().slice(before)).toEqual([]);
    vi.advanceTimersByTime(STATE_INTERVAL_MS);
    const states = socket().sent.slice(before);
    expect(states).toHaveLength(1);
    expect(states[0]).toMatchObject({ type: 'state', state: { simTimeS: 5 } });
    vi.advanceTimersByTime(STATE_INTERVAL_MS);
    runtime.ctx.store.update((s) => ({ ...s, simTimeS: 6 }));
    expect(socket().sent.at(-1)).toMatchObject({ type: 'state', state: { simTimeS: 6 } });
  });

  it('relays sim events and republishes dashboard messages, ignoring the rest', () => {
    socket().open();
    const seen: ServerToDashboard[] = [];
    bridge.onServerMessage((m) => seen.push(m));
    runtime.ctx.emitEvent({ type: 'plant_regenerated', seed: 4 });
    expect(socket().sent.at(-1)).toEqual({ type: 'sim_event', event: { type: 'plant_regenerated', seed: 4 } });
    socket().receive({ type: 'phase', phase: 'detected', reason: 'x' });
    socket().receive({ type: 'state', state: createDefaultWorld(2) });
    socket().receive('garbage');
    expect(seen).toEqual([{ type: 'phase', phase: 'detected', reason: 'x' }]);
  });

  it('reconnects 2 s after a drop and stops after close()', () => {
    socket().open();
    socket().drop();
    expect(bridge.status()).toBe('disconnected');
    expect(FakeSocket.instances).toHaveLength(1);
    vi.advanceTimersByTime(RECONNECT_MS - 1);
    expect(FakeSocket.instances).toHaveLength(1);
    vi.advanceTimersByTime(1);
    expect(FakeSocket.instances).toHaveLength(2);
    socket().open();
    expect(socket().sent[0]).toEqual({ type: 'hello', role: 'sim' });
    expect(statuses).toEqual(['connected', 'disconnected', 'connected']);
    const sentBeforeClose = socket().sent.length;
    bridge.close();
    expect(socket().readyState).toBe(3);
    expect(statuses.at(-1)).toBe('disconnected');
    vi.advanceTimersByTime(RECONNECT_MS * 2);
    expect(FakeSocket.instances).toHaveLength(2);
    runtime.ctx.store.update((s) => ({ ...s, simTimeS: 9 }));
    vi.advanceTimersByTime(STATE_INTERVAL_MS);
    expect(socket().sent).toHaveLength(sentBeforeClose);
  });
});
