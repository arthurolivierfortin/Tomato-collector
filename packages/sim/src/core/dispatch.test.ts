import { describe, expect, it } from 'vitest';
import { createDefaultWorld, ok } from '@tomato/shared';
import type { SimAction } from '@tomato/shared';
import { applyAction } from './dispatch';
import type { SimContext, SimModule } from './module';
import { createWorldStore } from './store';
import { createSignals } from './signals';

function ctx(): SimContext {
  return {
    store: createWorldStore(createDefaultWorld(1)),
    signals: createSignals(),
    emitEvent: () => undefined,
    scene: null,
    registry: { plantSpec: null },
  };
}

describe('applyAction', () => {
  it('routes to the first module that handles the action', () => {
    const a: SimModule = { name: 'a', init: () => undefined, handle: () => null };
    const b: SimModule = { name: 'b', init: () => undefined, handle: (action, c) => ok(c.store.get(), `b:${action.type}`) };
    const r = applyAction([a, b], { type: 'cut' }, ctx());
    expect(r.ok).toBe(true);
    expect(r.message).toBe('b:cut');
  });

  it('fails with not_available when nobody handles it', () => {
    const r = applyAction([], { type: 'cut' } as SimAction, ctx());
    expect(r.ok).toBe(false);
    if (r.ok) throw new Error('unreachable');
    expect(r.error).toBe('not_available');
  });
});
