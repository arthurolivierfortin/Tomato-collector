import { fail, ok } from '@tomato/shared';
import type { SimContext, SimModule } from '../core/module';
import { createFakePhysics } from './fakePhysics';
import { createFallTracker } from './falling';
import type { FallTracker } from './falling';
import { generatePlant } from './generatePlant';
import type { PlantSpec, TomatoSpec } from './generatePlant';
import type { PlantPhysics } from './physics';
import { nextToRipen, ripenTomato, tomatoesFromSpec } from './plantState';
import type { PlantView } from './view';

export interface PlantModuleDeps {
  createPhysics?: (ctx: SimContext) => Promise<PlantPhysics>;
  createView?: (ctx: SimContext) => Promise<PlantView | null>;
}

async function defaultPhysics(ctx: SimContext): Promise<PlantPhysics> {
  if (!ctx.scene) return createFakePhysics();
  const { createRapierPhysics } = await import('./rapierPhysics');
  return createRapierPhysics();
}

async function defaultView(ctx: SimContext): Promise<PlantView | null> {
  if (!ctx.scene) return null;
  const { createPlantView } = await import('./plantView');
  return createPlantView(ctx.scene);
}

const nextSeed = (seed: number): number => (seed + 1) >>> 0;

/** État du module pour UN contexte : physique, vue et échéances de maturité du plant courant. */
interface PlantState {
  specById: Map<number, TomatoSpec>;
  /** Instant sim de maturité par tomate (posé à la création du plant, modifié par ripen_next). */
  ripenAt: Map<number, number>;
  physics: PlantPhysics;
  fall: FallTracker;
  view: PlantView | null;
}

export function createPlantModule(deps: PlantModuleDeps = {}): SimModule {
  /**
   * Un état par contexte : en développement React StrictMode monte la scène deux fois et
   * l'instance `plantModule` reçoit deux contextes ; chacun garde sa physique et sa vue.
   */
  const states = new WeakMap<SimContext, PlantState>();

  function loadPlant(ctx: SimContext, st: PlantState, seed: number): PlantSpec {
    const spec = generatePlant(seed);
    const simTimeS = ctx.store.get().simTimeS;
    st.specById.clear();
    st.ripenAt.clear();
    for (const t of spec.tomatoes) {
      st.specById.set(t.id, t);
      st.ripenAt.set(t.id, simTimeS + t.ripenAtS);
    }
    ctx.registry.plantSpec = spec;
    st.physics.clear();
    st.fall.reset();
    const tomatoes = tomatoesFromSpec(spec, 0);
    for (const t of tomatoes) st.physics.attach(t.id, t.positionCm, t.radiusCm);
    ctx.store.update((s) => ({ ...s, seed, tomatoes, targetTomatoId: null }));
    st.view?.setSpec(spec);
    st.view?.sync(tomatoes);
    return spec;
  }

  /** Mûrit les attachées, suit les détachées, pousse la vue, puis décide les chutes et émet tomato_landed. */
  function refresh(ctx: SimContext, st: PlantState, dtSimS: number): void {
    const s = ctx.store.get();
    const tomatoes = s.tomatoes.map((t) => {
      const spec = st.specById.get(t.id);
      if (!spec) return t;
      if (t.attached) return ripenTomato(t, spec, st.ripenAt.get(t.id) ?? spec.ripenAtS, s.simTimeS);
      return { ...t, positionCm: st.physics.positionOf(t.id) ?? t.positionCm };
    });
    ctx.store.update((prev) => ({ ...prev, tomatoes }));
    st.view?.sync(tomatoes);
    for (const l of st.fall.advance(dtSimS, tomatoes, s.basket)) {
      ctx.emitEvent({ type: 'tomato_landed', tomatoId: l.tomatoId, inBasket: l.inBasket });
    }
  }

  function onCut(ctx: SimContext, st: PlantState, tomatoId: number): void {
    const t = ctx.store.get().tomatoes.find((x) => x.id === tomatoId);
    if (!t || !t.attached) return;
    if (!st.fall.release(t)) return;
    ctx.store.update((s) => ({
      ...s,
      tomatoes: s.tomatoes.map((x) => (x.id === tomatoId ? { ...x, attached: false } : x)),
    }));
    st.view?.sync(ctx.store.get().tomatoes);
  }

  return {
    name: 'plant',
    async init(ctx) {
      const physics = await (deps.createPhysics ?? defaultPhysics)(ctx);
      const st: PlantState = {
        specById: new Map(),
        ripenAt: new Map(),
        physics,
        fall: createFallTracker(physics),
        view: await (deps.createView ?? defaultView)(ctx),
      };
      states.set(ctx, st);
      st.physics.setBasket(ctx.store.get().basket);
      loadPlant(ctx, st, ctx.store.get().seed);
      ctx.signals.on('tomato_cut', (sig) => onCut(ctx, st, sig.tomatoId));
    },
    update(dtSimS, ctx) {
      const st = states.get(ctx);
      if (!st || dtSimS <= 0) return;
      st.physics.setBasket(ctx.store.get().basket);
      st.physics.step(dtSimS);
      refresh(ctx, st, dtSimS);
    },
    handle(action, ctx) {
      const st = states.get(ctx);
      const s = ctx.store.get();
      if (!st) return null;
      switch (action.type) {
        case 'ripen_next': {
          const id = nextToRipen(s.tomatoes, st.ripenAt);
          if (id === null) return fail(s, 'not_available', 'no unripe tomato left on the plant');
          st.ripenAt.set(id, s.simTimeS);
          refresh(ctx, st, 0);
          return ok(ctx.store.get(), `tomato ${id} is ripe`);
        }
        case 'new_plant': {
          const seed = action.seed ?? nextSeed(s.seed);
          loadPlant(ctx, st, seed);
          ctx.signals.emit({ type: 'plant_regenerated', seed });
          ctx.emitEvent({ type: 'plant_regenerated', seed });
          return ok(ctx.store.get(), `new plant with seed ${seed}`);
        }
        default:
          return null;
      }
    },
  };
}

/** Instance ajoutée à MODULES dans App.tsx. */
export const plantModule: SimModule = createPlantModule();
