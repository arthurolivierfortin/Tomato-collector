import { describe, expect, it, vi } from 'vitest';
import { createDefaultWorld } from '@tomato/shared';
import { createRuntime } from '../core/runtime';
import { createFakeBridge } from '../bridge/fakeBridge';
import { loadLiveBridge, type LiveBridgeOptions } from './bridgeLoader';

async function options(): Promise<LiveBridgeOptions> {
  const runtime = await createRuntime(createDefaultWorld(1), null, []);
  return { url: 'ws://localhost:7332', runtime, renderViews: () => Promise.reject(new Error('no views')) };
}

describe('loadLiveBridge', () => {
  it('returns null when no bridge module exists (M5 not merged)', async () => {
    expect(await loadLiveBridge(await options(), {})).toBeNull();
  });

  it('returns null when the module has no createBridge export', async () => {
    expect(await loadLiveBridge(await options(), { '../bridge/createBridge.ts': async () => ({}) })).toBeNull();
  });

  it('calls createBridge with the options and returns its bridge', async () => {
    const bridge = createFakeBridge([]);
    const createBridge = vi.fn(() => bridge);
    const opts = await options();
    const got = await loadLiveBridge(opts, { '../bridge/createBridge.ts': async () => ({ createBridge }) });
    expect(got).toBe(bridge);
    expect(createBridge).toHaveBeenCalledWith(opts);
  });
});
