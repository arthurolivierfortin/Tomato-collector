import { describe, expect, it, vi } from 'vitest';
import { createDefaultWorld } from '@tomato/shared';
import { createWorldStore } from './store';

describe('createWorldStore', () => {
  it('returns the current state and notifies subscribers on update', () => {
    const store = createWorldStore(createDefaultWorld(1));
    const seen = vi.fn();
    const unsubscribe = store.subscribe(seen);
    store.update((s) => ({ ...s, simTimeS: 5 }));
    expect(store.get().simTimeS).toBe(5);
    expect(seen).toHaveBeenCalledTimes(1);
    unsubscribe();
    store.update((s) => ({ ...s, simTimeS: 6 }));
    expect(seen).toHaveBeenCalledTimes(1);
  });
});
