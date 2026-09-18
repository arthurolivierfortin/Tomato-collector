import { createDefaultWorld, ok } from '@tomato/shared';
import type { WorldState } from '@tomato/shared';
import { describe, expect, it, vi } from 'vitest';
import { createMotionRunner, type Motion } from './animate';
import { createLane } from './animation';
import { createTimedTween } from './animation';
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

const settle = (): Promise<void> => new Promise((r) => setTimeout(r, 0));

/** Ouverture des lames de 0 à 60° en `durationS` secondes SIM. */
const opening = (durationS: number) => (from: WorldState, to: WorldState): Motion => {
  const t = createTimedTween(from.scissors.openingDeg, to.scissors.openingDeg, durationS);
  return {
    step(dtSimS, current) {
      const openingDeg = t.step(dtSimS);
      return { state: { ...current, scissors: { ...current.scissors, openingDeg } }, done: t.done };
    },
  };
};

const open = (s: WorldState) => ok({ ...s, scissors: { ...s.scissors, openingDeg: 60 } }, 'lames ouvertes');

describe('createMotionRunner', () => {
  it('writes the store on every frame and resolves at the end of the movement', async () => {
    const c = ctx();
    const runner = createMotionRunner();
    const seen = vi.fn();
    c.store.subscribe(seen);
    const p = runner.start(c, createLane(), { compute: open, motion: opening(1) });
    await settle();
    runner.update(0.5, c);
    expect(c.store.get().scissors.openingDeg).toBe(30);
    expect(seen).toHaveBeenCalledTimes(1);
    runner.update(0.5, c);
    expect((await p).message).toBe('lames ouvertes');
    expect(c.store.get().scissors.openingDeg).toBe(60);
    expect(runner.busy).toBe(false);
  });

  it('leaves the store untouched while the sim is paused (dt sim = 0)', async () => {
    const c = ctx();
    const runner = createMotionRunner();
    const p = runner.start(c, createLane(), { compute: open, motion: opening(1) });
    await settle();
    const before = c.store.get();
    const seen = vi.fn();
    c.store.subscribe(seen);
    for (let i = 0; i < 5; i++) runner.update(0, c);
    expect(seen).not.toHaveBeenCalled(); // aucun état inutile diffusé au serveur pendant la pause
    expect(c.store.get()).toBe(before);
    expect(runner.busy).toBe(true);

    runner.update(1, c);
    expect((await p).ok).toBe(true);
    expect(c.store.get().scissors.openingDeg).toBe(60);
  });

  it('still settles a movement with nothing to travel, even at dt sim = 0', async () => {
    const c = ctx();
    const runner = createMotionRunner();
    const p = runner.start(c, createLane(), { compute: open, motion: opening(0) });
    await settle();
    runner.update(0, c);
    expect((await p).ok).toBe(true);
    expect(c.store.get().scissors.openingDeg).toBe(60);
  });

  it('answers without moving and without touching the store when the reducer refuses', async () => {
    const c = ctx();
    const runner = createMotionRunner();
    const before = c.store.get();
    const seen = vi.fn();
    c.store.subscribe(seen);
    const r = await runner.start(c, createLane(), {
      compute: (s) => ({ ok: false, error: 'out_of_reach', message: 'trop loin', state: s }),
      motion: opening(1),
    });
    expect(r.ok).toBe(false);
    expect(c.store.get()).toBe(before);
    expect(seen).not.toHaveBeenCalled();
    expect(runner.busy).toBe(false);
  });
});
