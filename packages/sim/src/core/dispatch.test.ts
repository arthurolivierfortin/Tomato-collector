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

  it('prefers the animated variant and waits for the end of the movement', async () => {
    const c = ctx();
    let finish = (): void => undefined;
    const slow: SimModule = {
      name: 'slow',
      init: () => undefined,
      handle: (_action, cx) => ok(cx.store.get(), 'instantané'),
      handleAnimated: (_action, cx) =>
        new Promise((resolve) => {
          finish = () => resolve(ok(cx.store.get(), 'arrivé'));
        }),
    };
    const pending = applyAction([slow], { type: 'cut' }, c);
    finish();
    expect((await pending).message).toBe('arrivé');
  });

  it('falls back to handle for modules without an animated variant', async () => {
    const c = ctx();
    const quiet: SimModule = { name: 'quiet', init: () => undefined, handleAnimated: () => null, handle: (_a, cx) => ok(cx.store.get(), 'immédiat') };
    expect((await applyAction([quiet], { type: 'ripen_next' }, c)).message).toBe('immédiat');
  });

  it('fails with not_available when nobody handles it', async () => {
    const r = await applyAction([], { type: 'cut' } as SimAction, ctx());
    expect(r.ok).toBe(false);
    if (r.ok) throw new Error('unreachable');
    expect(r.error).toBe('not_available');
  });
});

describe('applyActionNow', () => {
  it('ignores the animated variant and answers synchronously', () => {
    const m: SimModule = {
      name: 'm',
      init: () => undefined,
      handle: (action, c) => ok(c.store.get(), `m:${action.type}`),
      handleAnimated: () => new Promise(() => undefined), // ne se résout jamais : ne doit pas être appelée
    };
    const r = applyActionNow([m], { type: 'cut' }, ctx());
    expect(r.ok).toBe(true);
    expect(r.message).toBe('m:cut');
  });

  it('fails with not_available when nobody handles it', () => {
    const r = applyActionNow([], { type: 'cut' } as SimAction, ctx());
    expect(r.ok).toBe(false);
    if (r.ok) throw new Error('unreachable');
    expect(r.error).toBe('not_available');
  });
});
