import { describe, expect, it, vi } from 'vitest';
import { createDefaultWorld } from '@tomato/shared';
import type { ActionResult, Tomato } from '@tomato/shared';
import type { SimContext, SimModule } from '../core/module';
import { createSignals } from '../core/signals';
import { BASKET_SPEED_CM_S, BLADES_DURATION_S, SCISSORS_ROTATION_SPEED_DEG_S, SCISSORS_SPEED_CM_S } from '../core/speeds';
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

/** Laisse tourner les microtâches (la file par outil démarre l'animation au tick suivant). */
const settle = (): Promise<void> => new Promise((r) => setTimeout(r, 0));

/** Suit une promesse d'action sans la consommer. */
function watch(p: Promise<ActionResult>): { settled: () => ActionResult | null } {
  let result: ActionResult | null = null;
  void p.then((r) => {
    result = r;
  });
  return { settled: () => result };
}

/** Avance l'animation de `steps` frames de `dtS` secondes SIM (en laissant la file démarrer entre deux). */
async function advance(m: SimModule, c: SimContext, dtS: number, steps: number): Promise<void> {
  for (let i = 0; i < steps; i++) {
    await settle();
    m.update!(dtS, c);
  }
  await settle();
}

const animated = (r: Promise<ActionResult> | null): Promise<ActionResult> => {
  if (r === null) throw new Error('attendu : une action animée');
  return r;
};

const now = (r: ActionResult | null): ActionResult => {
  if (r === null) throw new Error('attendu : un résultat immédiat');
  return r;
};

describe('robotModule (mode immédiat)', () => {
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
    const r = now(m.handle!({ type: 'move_basket', x: 10, y: 5, mode: 'absolute' }, c));
    expect(r.ok).toBe(true);
    expect(c.store.get().basket.centerCm).toEqual([10, 5, 5]);
    const before = c.store.get();
    const bad = now(m.handle!({ type: 'move_scissors', x: -30, y: 30, z: 60, mode: 'absolute' }, c));
    expect(bad.ok).toBe(false);
    expect(c.store.get()).toBe(before);
    const rot = now(m.handle!({ type: 'rotate_scissors', yaw: 45, mode: 'relative' }, c));
    expect(rot.ok).toBe(true);
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
    const r = now(m.handle!({ type: 'cut' }, c));
    expect(r.ok).toBe(true);
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
    const r = now(m.handle!({ type: 'cut' }, c));
    expect(r.ok).toBe(false);
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
    const blocked = now(m.handle!({ type: 'move_scissors', x: 30, y: -35, z: 60, mode: 'absolute' }, c));
    if (blocked.ok) throw new Error('expected a collision');
    expect(blocked.error).toBe('collision');
    expect(blocked.details?.blockedBy).toBe('stem');
    m.handle!({ type: 'open_scissors' }, c);
    const leaf = now(m.handle!({ type: 'cut' }, c));
    if (leaf.ok) throw new Error('expected leaf_cut');
    expect(leaf.error).toBe('leaf_cut');
  });
});

describe('robotModule (mouvements animés)', () => {
  it('moves the scissors at SCISSORS_SPEED_CM_S and answers only at the end', async () => {
    const m = createRobotModule();
    const c = ctx();
    m.init(c);
    // 15 cm de trajet à 15 cm/s = 1 s de temps SIM.
    const p = animated(m.handleAnimated!({ type: 'move_scissors', x: 45, y: -35, z: 45, mode: 'absolute' }, c));
    const w = watch(p);
    await settle();
    expect(c.store.get().scissors.cutPointCm).toEqual([45, -35, 60]); // rien n'a encore bougé

    const samples: number[] = [];
    for (let i = 0; i < 5; i++) {
      await advance(m, c, 0.1, 1);
      samples.push(c.store.get().scissors.cutPointCm[2]);
    }
    expect(samples).toEqual([...samples].sort((a, b) => b - a)); // descente monotone
    expect(samples.at(-1)).toBeCloseTo(52.5, 6); // mi-parcours après 0,5 s
    expect(w.settled()).toBeNull();

    await advance(m, c, 0.1, 6); // une frame de marge : 10 × 0,1 s n'atteint pas 1 s en flottant
    expect(c.store.get().scissors.cutPointCm).toEqual([45, -35, 45]); // pose finale exacte
    const r = await p;
    expect(r.ok).toBe(true);
    expect(r.message).toContain('(45, -35, 45)');
    expect(r.state.scissors.cutPointCm).toEqual([45, -35, 45]);
    expect(SCISSORS_SPEED_CM_S).toBe(15);
  });

  it('rejects an invalid move immediately, without moving', async () => {
    const m = createRobotModule();
    const c = ctx();
    m.init(c);
    const before = c.store.get().scissors.cutPointCm;
    const r = await animated(m.handleAnimated!({ type: 'move_scissors', x: -30, y: 30, z: 60, mode: 'absolute' }, c));
    expect(r.ok).toBe(false);
    if (r.ok) throw new Error('unreachable');
    expect(r.error).toBe('out_of_reach');
    expect(c.store.get().scissors.cutPointCm).toBe(before);
  });

  it('freezes while the sim is paused (dt sim = 0)', async () => {
    const m = createRobotModule();
    const c = ctx();
    m.init(c);
    const p = animated(m.handleAnimated!({ type: 'move_scissors', x: 45, y: -35, z: 45, mode: 'absolute' }, c));
    const w = watch(p);
    await advance(m, c, 0, 20);
    expect(c.store.get().scissors.cutPointCm).toEqual([45, -35, 60]);
    expect(w.settled()).toBeNull();
    await advance(m, c, 0.25, 4);
    expect((await p).ok).toBe(true);
  });

  it('queues a second action on the same tool behind the first', async () => {
    const m = createRobotModule();
    const c = ctx();
    m.init(c);
    const first = animated(m.handleAnimated!({ type: 'move_scissors', x: 45, y: -35, z: 45, mode: 'absolute' }, c));
    const second = animated(m.handleAnimated!({ type: 'move_scissors', x: 0, y: 0, z: 15, mode: 'relative' }, c));
    const w2 = watch(second);
    await advance(m, c, 0.25, 4);
    expect(await first).toMatchObject({ ok: true });
    expect(w2.settled()).toBeNull(); // le second n'a pas encore commencé à répondre
    await advance(m, c, 0.25, 5);
    expect((await second).ok).toBe(true);
    expect(c.store.get().scissors.cutPointCm).toEqual([45, -35, 60]); // reparti du point d'arrivée du premier
  });

  it('rotates at SCISSORS_ROTATION_SPEED_DEG_S and takes the short way round', async () => {
    const m = createRobotModule();
    const c = ctx();
    m.init(c);
    const p = animated(m.handleAnimated!({ type: 'rotate_scissors', yaw: 90, mode: 'relative' }, c)); // 90° à 45°/s = 2 s
    await advance(m, c, 0.5, 2);
    expect(c.store.get().scissors.yawDeg).toBeCloseTo(45, 6);
    await advance(m, c, 0.5, 3);
    expect((await p).ok).toBe(true);
    expect(c.store.get().scissors.yawDeg).toBe(90);
    expect(SCISSORS_ROTATION_SPEED_DEG_S).toBe(45);
  });

  it('opens the blades over BLADES_DURATION_S', async () => {
    const m = createRobotModule();
    const c = ctx();
    m.init(c);
    const p = animated(m.handleAnimated!({ type: 'open_scissors' }, c));
    await advance(m, c, BLADES_DURATION_S / 2, 1);
    expect(c.store.get().scissors.openingDeg).toBeCloseTo(30, 6);
    await advance(m, c, BLADES_DURATION_S / 2, 2);
    expect((await p).ok).toBe(true);
    expect(c.store.get().scissors.openingDeg).toBe(60);
  });

  it('closes the blades before cutting and only then emits tomato_cut', async () => {
    const m = createRobotModule();
    const c = ctx([onStem]);
    m.init(c);
    const seen = vi.fn();
    c.signals.on('tomato_cut', seen);
    const opened = animated(m.handleAnimated!({ type: 'open_scissors' }, c));
    await advance(m, c, 0.25, 3);
    expect((await opened).ok).toBe(true);
    const p = animated(m.handleAnimated!({ type: 'cut' }, c));
    const w = watch(p);
    await advance(m, c, BLADES_DURATION_S / 2, 1);
    expect(c.store.get().scissors.openingDeg).toBeCloseTo(30, 6);
    expect(seen).not.toHaveBeenCalled();
    expect(w.settled()).toBeNull();
    await advance(m, c, BLADES_DURATION_S / 2, 2);
    expect((await p).ok).toBe(true);
    expect(c.store.get().scissors.openingDeg).toBe(0);
    expect(seen).toHaveBeenCalledWith({ type: 'tomato_cut', tomatoId: 3 });
  });

  it('moves the basket at BASKET_SPEED_CM_S, in parallel with the scissors', async () => {
    const m = createRobotModule();
    const c = ctx();
    m.init(c);
    const scissors = animated(m.handleAnimated!({ type: 'move_scissors', x: 45, y: -35, z: 45, mode: 'absolute' }, c));
    const basket = animated(m.handleAnimated!({ type: 'move_basket', x: 15, y: 0, mode: 'absolute' }, c)); // 15 cm = 1 s
    await advance(m, c, 0.25, 2);
    expect(c.store.get().basket.centerCm[0]).toBeCloseTo(7.5, 6);
    await advance(m, c, 0.25, 3);
    expect((await basket).ok).toBe(true);
    expect((await scissors).ok).toBe(true);
    expect(c.store.get().basket.centerCm).toEqual([15, 0, 5]);
    expect(BASKET_SPEED_CM_S).toBe(15);
  });
});
