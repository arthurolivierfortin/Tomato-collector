import { describe, expect, it } from 'vitest';
import { createDefaultWorld } from '@tomato/shared';
import type { SimEvent } from '@tomato/shared';
import type { SimContext, SimModule } from '../core/module';
import { createSignals } from '../core/signals';
import { createWorldStore } from '../core/store';
import { createFakePhysics } from './fakePhysics';
import { generatePlant } from './generatePlant';
import { createPlantModule } from './plantModule';

const SEED = 123;

async function setup() {
  const events: SimEvent[] = [];
  const ctx: SimContext = {
    store: createWorldStore(createDefaultWorld(SEED)),
    signals: createSignals(),
    emitEvent: (e) => events.push(e),
    scene: null,
    registry: { plantSpec: null },
  };
  const physics = createFakePhysics();
  const mod = createPlantModule({ createPhysics: () => Promise.resolve(physics), createView: () => Promise.resolve(null) });
  await mod.init(ctx);
  return { ctx, mod, events, physics };
}

/** Avance la sim de `seconds` par pas de 10 ms (horloge simulée à la main : le module reçoit le dt sim). */
function tick(mod: SimModule, ctx: SimContext, seconds: number): void {
  for (let i = 0; i < Math.round(seconds * 100); i++) {
    ctx.store.update((s) => ({ ...s, simTimeS: s.simTimeS + 0.01 }));
    mod.update!(0.01, ctx);
  }
}

describe('plantModule init', () => {
  it('publishes the plant spec and fills the store tomatoes per the contract', async () => {
    const { ctx } = await setup();
    const spec = generatePlant(SEED);
    expect(ctx.registry.plantSpec).toEqual(spec);
    const tomatoes = ctx.store.get().tomatoes;
    expect(tomatoes.map((t) => t.id)).toEqual(spec.tomatoes.map((t) => t.id));
    for (const t of tomatoes) {
      expect(t.attached).toBe(true);
      // La première tomate mûrit à 10 s (plant v2) : sa rampe de 15 s a déjà commencé au chargement,
      // mais aucune tomate n'est mûre ni même en transition (ripeness < 0,35).
      expect(t.state).toBe('unripe');
      expect(t.ripeness).toBeLessThan(0.35);
      expect(t.visibleIn).toEqual({ top: 1, front: 1, side: 1 });
    }
    const t0 = tomatoes[0]!;
    const s0 = spec.tomatoes[0]!;
    expect(t0.positionCm).toEqual(s0.centerCm);
    expect(t0.stem.fromCm).toEqual(s0.anchorCm);
    // Point d'attache sur la surface du fruit au rayon COURANT (la rampe de maturité a déjà commencé à t = 0).
    expect(Math.hypot(...t0.stem.toCm.map((v, i) => v - s0.centerCm[i]!))).toBeCloseTo(t0.radiusCm);
  });
});

describe('plantModule ripening', () => {
  it('ripens tomatoes with sim time: turning halfway, ripe with radius ×1.2 at ripenAtS', async () => {
    const { ctx, mod } = await setup();
    const spec = generatePlant(SEED);
    const first = [...spec.tomatoes].sort((a, b) => a.ripenAtS - b.ripenAtS)[0]!;
    ctx.store.update((s) => ({ ...s, simTimeS: first.ripenAtS - 7.5 }));
    mod.update!(0.01, ctx);
    let t = ctx.store.get().tomatoes.find((x) => x.id === first.id)!;
    expect(t.state).toBe('turning');
    expect(t.ripeness).toBeCloseTo(0.5);
    ctx.store.update((s) => ({ ...s, simTimeS: first.ripenAtS }));
    mod.update!(0.01, ctx);
    t = ctx.store.get().tomatoes.find((x) => x.id === first.id)!;
    expect(t.state).toBe('ripe');
    expect(t.radiusCm).toBeCloseTo(first.radiusCm * 1.2);
  });

  it('does nothing while paused (dt = 0) and preserves visibleIn written by another module', async () => {
    const { ctx, mod } = await setup();
    ctx.store.update((s) => ({
      ...s,
      tomatoes: s.tomatoes.map((t, i) => (i === 0 ? { ...t, visibleIn: { top: 0.42, front: 1, side: 0 } } : t)),
    }));
    const before = ctx.store.get();
    mod.update!(0, ctx);
    expect(ctx.store.get()).toBe(before);
    tick(mod, ctx, 0.1);
    expect(ctx.store.get().tomatoes[0]!.visibleIn).toEqual({ top: 0.42, front: 1, side: 0 });
  });
});

describe('plantModule actions', () => {
  it('ripen_next ripens the next attached unripe tomato immediately, then fails with not_available', async () => {
    const { ctx, mod } = await setup();
    const spec = generatePlant(SEED);
    const first = [...spec.tomatoes].sort((a, b) => a.ripenAtS - b.ripenAtS)[0]!;
    const r = mod.handle!({ type: 'ripen_next' }, ctx);
    expect(r?.ok).toBe(true);
    expect(r?.message).toContain(`tomato ${first.id}`);
    const ripe = ctx.store.get().tomatoes.filter((t) => t.state === 'ripe');
    expect(ripe.map((t) => t.id)).toEqual([first.id]);
    expect(ripe[0]!.ripeness).toBe(1);
    for (let i = 1; i < spec.tomatoes.length; i++) expect(mod.handle!({ type: 'ripen_next' }, ctx)?.ok).toBe(true);
    const last = mod.handle!({ type: 'ripen_next' }, ctx);
    expect(last?.ok).toBe(false);
    if (!last || last.ok) throw new Error('unreachable');
    expect(last.error).toBe('not_available');
  });

  it('new_plant regenerates everything, resets the target and announces the seed', async () => {
    const { ctx, mod, events } = await setup();
    const signals: number[] = [];
    ctx.signals.on('plant_regenerated', (s) => signals.push(s.seed));
    ctx.store.update((s) => ({ ...s, simTimeS: 100, targetTomatoId: 1 }));
    const r = mod.handle!({ type: 'new_plant', seed: 777 }, ctx);
    expect(r?.ok).toBe(true);
    const s = ctx.store.get();
    expect(s.seed).toBe(777);
    expect(s.targetTomatoId).toBeNull();
    expect(ctx.registry.plantSpec).toEqual(generatePlant(777));
    expect(s.tomatoes.map((t) => t.id)).toEqual(generatePlant(777).tomatoes.map((t) => t.id));
    for (const t of s.tomatoes) expect(t.state).toBe('unripe');
    expect(signals).toEqual([777]);
    expect(events).toEqual([{ type: 'plant_regenerated', seed: 777 }]);
  });

  it('new_plant without a seed picks a different one', async () => {
    const { ctx, mod } = await setup();
    mod.handle!({ type: 'new_plant' }, ctx);
    expect(ctx.store.get().seed).not.toBe(SEED);
  });

  it('ignores actions of other modules', async () => {
    const { ctx, mod } = await setup();
    expect(mod.handle!({ type: 'cut' }, ctx)).toBeNull();
  });
});

describe('plantModule cut and landing', () => {
  /** La tomate la plus haute : elle a toujours de la place pour tomber dans le panier. */
  function highest(ctx: SimContext) {
    return [...ctx.store.get().tomatoes].sort((a, b) => b.positionCm[2] - a.positionCm[2])[0]!;
  }

  it('releases a cut tomato, follows it in the store and emits tomato_landed once with inBasket = true', async () => {
    const { ctx, mod, events } = await setup();
    const t0 = highest(ctx);
    ctx.store.update((s) => ({ ...s, basket: { ...s.basket, centerCm: [t0.positionCm[0], t0.positionCm[1], 5] } }));
    ctx.signals.emit({ type: 'tomato_cut', tomatoId: t0.id });
    expect(ctx.store.get().tomatoes.find((t) => t.id === t0.id)!.attached).toBe(false);
    tick(mod, ctx, 1);
    expect(events.filter((e) => e.type === 'tomato_landed')).toEqual([{ type: 'tomato_landed', tomatoId: t0.id, inBasket: true }]);
    const after = ctx.store.get().tomatoes.find((t) => t.id === t0.id)!;
    expect(after.positionCm[2]).toBeCloseTo(5 + after.radiusCm);
    expect(after.positionCm[2]).toBeLessThan(t0.positionCm[2]);
    tick(mod, ctx, 3);
    expect(events.filter((e) => e.type === 'tomato_landed')).toHaveLength(1);
  });

  it('emits inBasket = false when the tomato lands on the floor', async () => {
    const { ctx, mod, events } = await setup();
    const t0 = highest(ctx);
    ctx.store.update((s) => ({ ...s, basket: { ...s.basket, centerCm: [t0.positionCm[0] + 30, t0.positionCm[1] + 30, 5] } }));
    ctx.signals.emit({ type: 'tomato_cut', tomatoId: t0.id });
    tick(mod, ctx, 1);
    expect(events.filter((e) => e.type === 'tomato_landed')).toEqual([{ type: 'tomato_landed', tomatoId: t0.id, inBasket: false }]);
    const after = ctx.store.get().tomatoes.find((t) => t.id === t0.id)!;
    expect(after.positionCm[2]).toBeCloseTo(after.radiusCm);
  });

  it('ignores a cut for an unknown or already cut tomato', async () => {
    const { ctx, mod, events } = await setup();
    const t0 = highest(ctx);
    ctx.signals.emit({ type: 'tomato_cut', tomatoId: 999 });
    ctx.signals.emit({ type: 'tomato_cut', tomatoId: t0.id });
    ctx.signals.emit({ type: 'tomato_cut', tomatoId: t0.id });
    tick(mod, ctx, 4);
    expect(events.filter((e) => e.type === 'tomato_landed')).toHaveLength(1);
  });

  it('forgets a falling tomato on new_plant', async () => {
    const { ctx, mod, events } = await setup();
    ctx.signals.emit({ type: 'tomato_cut', tomatoId: highest(ctx).id });
    mod.handle!({ type: 'new_plant', seed: 5 }, ctx);
    tick(mod, ctx, 4);
    expect(events.filter((e) => e.type === 'tomato_landed')).toEqual([]);
    for (const t of ctx.store.get().tomatoes) expect(t.attached).toBe(true);
  });
});
