import { describe, expect, it } from 'vitest';
import { createDefaultWorld } from '@tomato/shared';
import type { SimContext } from '../core/module';
import { createSignals } from '../core/signals';
import { createWorldStore } from '../core/store';
import { cameraModule, getRenderViews } from './cameraModule';

function ctx(): SimContext {
  return {
    store: createWorldStore(createDefaultWorld(1)),
    signals: createSignals(),
    emitEvent: () => undefined,
    scene: null,
    registry: { plantSpec: null },
  };
}

describe('cameraModule (without a scene)', () => {
  it('handles move_camera through the store and ignores other actions', async () => {
    const c = ctx();
    await cameraModule.init(c);
    expect(getRenderViews()).toBeNull();
    const r = cameraModule.handle!({ type: 'move_camera', camera: 'front', dy: 20 }, c);
    expect(r?.ok).toBe(true);
    expect(c.store.get().cameras.front.positionCm).toEqual([0, -80, 45]);
    expect(cameraModule.handle!({ type: 'cut' }, c)).toBeNull();
    const bad = cameraModule.handle!({ type: 'move_camera', camera: 'front', dy: 200 }, c);
    expect(bad?.ok).toBe(false);
    expect(c.store.get().cameras.front.positionCm).toEqual([0, -80, 45]);
  });

  it('update is a no-op without a scene', () => {
    const c = ctx();
    expect(() => cameraModule.update!(0.016, c)).not.toThrow();
  });
});
