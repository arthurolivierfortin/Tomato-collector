import { describe, expect, it } from 'vitest';
import { createDefaultWorld, ok } from '@tomato/shared';
import type { SimAction } from '@tomato/shared';
import { applyAction, applyActionNow } from './dispatch';
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
  it('routes to the first module that handles the action', async () => {
    const a: SimModule = { name: 'a', init: () => undefined, handle: () => null };
    const b: SimModule = { name: 'b', init: () => undefined, handle: (action, c) => ok(c.store.get(), `b:${action.type}`) };
    const r = await applyAction([a, b], { type: 'cut' }, ctx());
    expect(r.ok).toBe(true);
    expect(r.message).toBe('b:cut');
  });

  it('waits for a module that answers only at the end of its movement', async () => {
    const c = ctx();
    let finish = (): void => undefined;
    const slow: SimModule = {
      name: 'slow',
      init: () => undefined,
      handle: (_action, cx) =>
        new Promise((resolve) => {
          finish = () => resolve(ok(cx.store.get(), 'arrived'));
        }),
    };
    const pending = applyAction([slow], { type: 'cut' }, c);
    finish();
    expect((await pending).message).toBe('arrived');
  });

  it('fails with not_available when nobody handles it', async () => {
    const r = await applyAction([], { type: 'cut' } as SimAction, ctx());
    expect(r.ok).toBe(false);
    if (r.ok) throw new Error('unreachable');
    expect(r.error).toBe('not_available');
  });
});

describe('applyActionNow', () => {
  it('asks modules for the instant variant and returns the result synchronously', () => {
    const seen: boolean[] = [];
    const m: SimModule = {
      name: 'm',
      init: () => undefined,
      handle: (action, c, opts) => {
        seen.push(opts?.instant === true);
        return ok(c.store.get(), `m:${action.type}`);
      },
    };
    const r = applyActionNow([m], { type: 'cut' }, ctx());
    expect(r.ok).toBe(true);
    expect(r.message).toBe('m:cut');
    expect(seen).toEqual([true]);
  });

  it('throws when a module answers asynchronously despite instant', () => {
    const m: SimModule = { name: 'lent', init: () => undefined, handle: (_a, c) => Promise.resolve(ok(c.store.get(), 'plus tard')) };
    expect(() => applyActionNow([m], { type: 'cut' }, ctx())).toThrow(/lent/);
  });

  it('fails with not_available when nobody handles it', () => {
    const r = applyActionNow([], { type: 'cut' } as SimAction, ctx());
    expect(r.ok).toBe(false);
    if (r.ok) throw new Error('unreachable');
    expect(r.error).toBe('not_available');
  });
});
