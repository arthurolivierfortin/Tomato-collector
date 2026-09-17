import { fail, ok } from '@tomato/shared';
import type { SimContext, SimModule } from '../core/module';
import { createFakePhysics } from './fakePhysics';
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

export function createPlantModule(deps: PlantModuleDeps = {}): SimModule {
  const specById = new Map<number, TomatoSpec>();
  /** Instant sim de maturité par tomate (relatif à la création du plant, modifié par ripen_next). */
  const ripenAt = new Map<number, number>();
  let physics: PlantPhysics = createFakePhysics();
  let view: PlantView | null = null;

  function loadPlant(ctx: SimContext, seed: number): PlantSpec {
    const spec = generatePlant(seed);
    const simTimeS = ctx.store.get().simTimeS;
    specById.clear();
    ripenAt.clear();
    for (const t of spec.tomatoes) {
      specById.set(t.id, t);
      ripenAt.set(t.id, simTimeS + t.ripenAtS);
    }
    ctx.registry.plantSpec = spec;
    physics.clear();
    const tomatoes = tomatoesFromSpec(spec, 0);
    for (const t of tomatoes) physics.attach(t.id, t.positionCm, t.radiusCm);
    ctx.store.update((s) => ({ ...s, seed, tomatoes, targetTomatoId: null }));
    view?.setSpec(spec);
    view?.sync(tomatoes);
    return spec;
  }

  /** Recalcule les tomates depuis le store (mûrissement des attachées, position des détachées) et pousse la vue. */
  function refresh(ctx: SimContext): void {
    const s = ctx.store.get();
    const tomatoes = s.tomatoes.map((t) => {
      const spec = specById.get(t.id);
      if (!spec) return t;
      if (t.attached) return ripenTomato(t, spec, ripenAt.get(t.id) ?? spec.ripenAtS, s.simTimeS);
      return { ...t, positionCm: physics.positionOf(t.id) ?? t.positionCm };
    });
    ctx.store.update((st) => ({ ...st, tomatoes }));
    view?.sync(tomatoes);
  }

  return {
    name: 'plant',
    async init(ctx) {
      physics = await (deps.createPhysics ?? defaultPhysics)(ctx);
      view = await (deps.createView ?? defaultView)(ctx);
      physics.setBasket(ctx.store.get().basket);
      loadPlant(ctx, ctx.store.get().seed);
    },
    update(dtSimS, ctx) {
      if (dtSimS <= 0) return;
      physics.setBasket(ctx.store.get().basket);
      physics.step(dtSimS);
      refresh(ctx);
    },
    handle(action, ctx) {
      const s = ctx.store.get();
      switch (action.type) {
        case 'ripen_next': {
          const id = nextToRipen(s.tomatoes, ripenAt);
          if (id === null) return fail(s, 'not_available', 'no unripe tomato left on the plant');
          ripenAt.set(id, s.simTimeS);
          refresh(ctx);
          return ok(ctx.store.get(), `tomato ${id} is ripe`);
        }
        case 'new_plant': {
          const seed = action.seed ?? nextSeed(s.seed);
          loadPlant(ctx, seed);
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
