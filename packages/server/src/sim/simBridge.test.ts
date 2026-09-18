import { createDefaultWorld, ok, type SimEvent } from '@tomato/shared';
import { describe, expect, it } from 'vitest';
import { createFakeHub } from '../testing/fakes';
import { SIM_UNAVAILABLE, createSimBridge } from './simBridge';

describe('simBridge', () => {
  it('correlates action results by requestId and remembers the latest state', async () => {
    const hub = createFakeHub();
    let n = 0;
    const bridge = createSimBridge(hub, { newId: () => `req-${++n}` });
    expect(bridge.latestState()).toBeNull();

    const p1 = bridge.apply({ type: 'open_scissors' });
    const p2 = bridge.apply({ type: 'cut' });
    expect(hub.sent).toEqual([
      { type: 'apply_action', requestId: 'req-1', action: { type: 'open_scissors' } },
      { type: 'apply_action', requestId: 'req-2', action: { type: 'cut' } },
    ]);
    const w2 = { ...createDefaultWorld(2), simTimeS: 2 };
    const w1 = { ...createDefaultWorld(1), simTimeS: 1 };
    hub.emitSim({ type: 'action_result', requestId: 'req-2', result: ok(w2, 'stem_cut') });
    hub.emitSim({ type: 'action_result', requestId: 'req-1', result: ok(w1, 'opened') });
    expect((await p2).message).toBe('stem_cut');
    expect((await p1).message).toBe('opened');
    expect(bridge.latestState()?.simTimeS).toBe(1);

    hub.emitSim({ type: 'state', state: { ...w1, simTimeS: 5 } });
    expect(bridge.latestState()?.simTimeS).toBe(5);
  });

  it('answers views_result and falls back to an empty result without images', async () => {
    const hub = createFakeHub();
    const bridge = createSimBridge(hub, { newId: () => 'v1' });
    const p = bridge.renderViews(['front']);
    expect(hub.sent[0]).toEqual({ type: 'render_views', requestId: 'v1', cameras: ['front'] });
    const json = { ...createDefaultWorld(0), simTimeS: 3 };
    hub.emitSim({
      type: 'views_result',
      requestId: 'v1',
      result: { images: [{ camera: 'front', pngBase64: 'iVBOR', widthPx: 800, heightPx: 800 }], json: { ...json, tomatoes: [] } },
    });
    expect((await p).images).toHaveLength(1);

    hub.connected = false;
    const r = await bridge.renderViews(['top']);
    expect(r.images).toEqual([]);
    expect(r.json.phase).toBe('idle');
  });

  it('fails with not_available immediately without sim and after the timeout', async () => {
    const hub = createFakeHub();
    const logs: string[] = [];
    const bridge = createSimBridge(hub, { timeoutMs: 15, log: (l) => logs.push(l) });
    hub.connected = false;
    const r1 = await bridge.apply({ type: 'cut' });
    expect(r1.ok).toBe(false);
    if (r1.ok) throw new Error('unreachable');
    expect(r1.error).toBe('not_available');
    expect(r1.message).toBe(SIM_UNAVAILABLE);
    expect(hub.sent).toEqual([]);

    hub.connected = true;
    const r2 = await bridge.apply({ type: 'cut' });
    expect(r2.ok).toBe(false);
    expect(hub.sent).toHaveLength(1);
    expect(logs.some((l) => l.includes('délai dépassé'))).toBe(true);
    hub.emitSim({ type: 'action_result', requestId: 'late', result: ok(createDefaultWorld(0), 'late') });
    expect(logs.some((l) => l.includes('sans requête en attente'))).toBe(true);
  });

  it('relays sim events to listeners until unsubscribed', () => {
    const hub = createFakeHub();
    const bridge = createSimBridge(hub);
    const seen: SimEvent[] = [];
    const off = bridge.onEvent((e) => seen.push(e));
    hub.emitSim({ type: 'sim_event', event: { type: 'plant_regenerated', seed: 1 } });
    off();
    hub.emitSim({ type: 'sim_event', event: { type: 'plant_regenerated', seed: 2 } });
    expect(seen).toEqual([{ type: 'plant_regenerated', seed: 1 }]);
  });
});
