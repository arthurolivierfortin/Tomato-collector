import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ServerToDashboard } from '@tomato/shared';
import { createFakeBridge } from '../bridge/fakeBridge';
import { createBridgeSlot } from './bridgeSlot';
import type { DashboardBridge } from './bridgeTypes';
import { createDashboardStore } from './dashboardStore';

const phase = (p: 'detected' | 'harvesting' | 'cutting'): ServerToDashboard => ({ type: 'phase', phase: p, reason: 'test' });

describe('createBridgeSlot', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('accepts a fake bridge as a DashboardBridge (structural compatibility with the M5 contract)', () => {
    const bridge: DashboardBridge = createFakeBridge([]);
    expect(bridge.status()).toBe('connected');
  });

  it('setLive feeds the store and reports the connection; setLive(null) reports disconnected', () => {
    const store = createDashboardStore();
    const slot = createBridgeSlot(store);
    slot.setLive(createFakeBridge([{ atMs: 10, message: phase('detected') }]));
    expect(store.get().connection).toBe('connected');
    expect(slot.mode()).toBe('live');
    vi.advanceTimersByTime(10);
    expect(store.get().phase).toBe('detected');
    slot.setLive(null);
    expect(store.get().connection).toBe('disconnected');
    expect(slot.mode()).toBe('none');
  });

  it('play resets the store, ignores the live bridge meanwhile, and stop restores it', () => {
    const store = createDashboardStore();
    const slot = createBridgeSlot(store);
    const live = createFakeBridge([{ atMs: 50, message: phase('cutting') }, { atMs: 150, message: phase('harvesting') }]);
    slot.setLive(live);
    store.dispatch(phase('detected'));
    expect(store.get().trace).toHaveLength(1);

    slot.play(createFakeBridge([{ atMs: 20, message: phase('detected') }]));
    expect(slot.mode()).toBe('replay');
    expect(store.get().connection).toBe('replay');
    expect(store.get().trace).toHaveLength(0);
    vi.advanceTimersByTime(60); // replay message at 20 arrives, live message at 50 is ignored
    expect(store.get().trace.map((e) => e.title)).toEqual(['Phase détectée']);

    slot.stop();
    expect(slot.mode()).toBe('live');
    expect(store.get().connection).toBe('connected');
    vi.advanceTimersByTime(100); // live message at 150 arrives
    expect(store.get().phase).toBe('harvesting');
  });

  it('stop without a live bridge reports disconnected, and a closed replay bridge propagates its status', () => {
    const store = createDashboardStore();
    const slot = createBridgeSlot(store);
    const replay = createFakeBridge([]);
    slot.play(replay);
    replay.close();
    expect(store.get().connection).toBe('replay');
    slot.stop();
    expect(store.get().connection).toBe('disconnected');
    expect(slot.mode()).toBe('none');
  });
});
