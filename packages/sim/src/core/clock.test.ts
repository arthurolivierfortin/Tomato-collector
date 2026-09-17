import { describe, expect, it } from 'vitest';
import { createDefaultWorld } from '@tomato/shared';
import { clockModule } from './clock';
import type { SimContext } from './module';
import { createSignals } from './signals';
import { createWorldStore } from './store';

function ctx(): SimContext {
  return {
    store: createWorldStore(createDefaultWorld(1)),
    signals: createSignals(),
    emitEvent: () => undefined,
    scene: null,
    registry: { plantSpec: null },
  };
}

describe('clockModule', () => {
  it('advances sim time by real dt times the time scale, unless paused', () => {
    const c = ctx();
    clockModule.handle!({ type: 'set_time_scale', scale: 4 }, c);
    clockModule.update!(0.5, c);
    expect(c.store.get().simTimeS).toBe(2);
    clockModule.handle!({ type: 'set_paused', paused: true }, c);
    clockModule.update!(0.5, c);
    expect(c.store.get().simTimeS).toBe(2);
  });

  it('rejects a non-positive time scale and sets the target tomato', () => {
    const c = ctx();
    const r = clockModule.handle!({ type: 'set_time_scale', scale: 0 }, c);
    expect(r?.ok).toBe(false);
    clockModule.handle!({ type: 'set_target', tomatoId: 3 }, c);
    expect(c.store.get().targetTomatoId).toBe(3);
  });
});
