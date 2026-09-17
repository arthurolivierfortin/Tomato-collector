import { describe, expect, it, vi } from 'vitest';
import { createDefaultWorld } from '@tomato/shared';
import type { Tomato } from '@tomato/shared';
import type { SimContext } from '../core/module';
import { createSignals } from '../core/signals';
import { createWorldStore } from '../core/store';
import { createRobotModule } from './robotModule';

function ctx(tomatoes: Tomato[] = []): SimContext {
  return {
    store: createWorldStore({ ...createDefaultWorld(1), tomatoes }),
    signals: createSignals(),
    emitEvent: () => undefined,
    scene: null,
    registry: { plantSpec: null },
  };
}

/** Pédoncule vertical traversant le point de coupe par défaut [45,-35,60]. */
const onStem: Tomato = {
  id: 3, state: 'ripe', ripeness: 1, positionCm: [45, -35, 52], radiusCm: 3,
  stem: { fromCm: [45, -35, 65], toCm: [45, -35, 55] }, attached: true, visibleIn: { top: 1, front: 1, side: 1 },
};

describe('robotModule', () => {
  it('ignores actions of other modules', () => {
    const m = createRobotModule();
    const c = ctx();
    m.init(c);
    expect(m.handle!({ type: 'ripen_next' }, c)).toBeNull();
    expect(m.handle!({ type: 'set_target', tomatoId: 1 }, c)).toBeNull();
  });

  it('applies successful actions to the store and leaves it untouched on failure', () => {
    const m = createRobotModule();
    const c = ctx();
    m.init(c);
    const r = m.handle!({ type: 'move_basket', x: 10, y: 5, mode: 'absolute' }, c);
    expect(r?.ok).toBe(true);
    expect(c.store.get().basket.centerCm).toEqual([10, 5, 5]);
    const before = c.store.get();
    const bad = m.handle!({ type: 'move_scissors', x: -30, y: 30, z: 60, mode: 'absolute' }, c);
    expect(bad?.ok).toBe(false);
    expect(c.store.get()).toBe(before);
    const rot = m.handle!({ type: 'rotate_scissors', yaw: 45, mode: 'relative' }, c);
    expect(rot?.ok).toBe(true);
    expect(c.store.get().scissors.yawDeg).toBe(45);
  });

  it('emits tomato_cut on a successful cut and closes the blades', () => {
    const m = createRobotModule();
    const c = ctx([onStem]);
    m.init(c);
    const seen = vi.fn();
    c.signals.on('tomato_cut', seen);
    m.handle!({ type: 'open_scissors' }, c);
    expect(c.store.get().scissors.openingDeg).toBe(60);
    const r = m.handle!({ type: 'cut' }, c);
    expect(r?.ok).toBe(true);
    expect(seen).toHaveBeenCalledTimes(1);
    expect(seen).toHaveBeenCalledWith({ type: 'tomato_cut', tomatoId: 3 });
    expect(c.store.get().scissors.openingDeg).toBe(0);
  });

  it('does not emit on a failed cut', () => {
    const m = createRobotModule();
    const c = ctx();
    m.init(c);
    const seen = vi.fn();
    c.signals.on('tomato_cut', seen);
    m.handle!({ type: 'open_scissors' }, c);
    const r = m.handle!({ type: 'cut' }, c);
    expect(r?.ok).toBe(false);
    expect(seen).not.toHaveBeenCalled();
  });

  it('uses the main stem and the leaves of the registered plant spec', () => {
    const m = createRobotModule();
    const c = ctx();
    m.init(c);
    c.registry.plantSpec = {
      seed: 1,
      mainStem: [[40, -35, 0], [40, -35, 80]],
      stemRadiusCm: 1.1,
      branches: [],
      leaves: [{ positionCm: [45, -33, 60], normal: [0, 0, 1], sizeCm: 10, spinDeg: 0 }],
      tomatoes: [],
    };
    const blocked = m.handle!({ type: 'move_scissors', x: 30, y: -35, z: 60, mode: 'absolute' }, c);
    if (blocked === null || blocked.ok) throw new Error('expected a collision');
    expect(blocked.error).toBe('collision');
    expect(blocked.details?.blockedBy).toBe('stem');
    m.handle!({ type: 'open_scissors' }, c);
    const leaf = m.handle!({ type: 'cut' }, c);
    if (leaf === null || leaf.ok) throw new Error('expected leaf_cut');
    expect(leaf.error).toBe('leaf_cut');
  });
});
