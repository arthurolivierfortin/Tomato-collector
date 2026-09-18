import { fail, ok } from '@tomato/shared';
import type { Tomato } from '@tomato/shared';
import type { SimContext, SimModule } from '../core/module';
import { createFakePhysics } from './fakePhysics';
import { createFallTracker } from './falling';
import type { FallTracker } from './falling';
import { generatePlant } from './generatePlant';
import type { PlantSpec, TomatoSpec } from './generatePlant';
import type { PlantPhysics } from './physics';
import { ripenTomato, tomatoFromSpec } from './plantState';
import { RIPEN_DURATION_S } from './ripening';
import { nextRipeningStart, ripenNextTarget } from './ripeningSchedule';
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

/** Échéance d'un fruit que le planificateur n'a pas encore appelé : sa rampe n'a jamais commencé. */
const NEVER_S = Infinity;

/** État du module pour UN contexte : physique, vue et échéances de maturité du plant courant. */
interface PlantState {
  specById: Map<number, TomatoSpec>;
  /** Instant sim de maturité par tomate, posé par le planificateur (issue #23) ou par `ripen_next`. */
  ripenAt: Map<number, number>;
  /** Instant sim du chargement du plant : le planificateur compte les secondes à partir de là. */
  startedAtS: number;
  /** Fruit en cours de mûrissement, seul autorisé à avancer sur sa rampe. */
  currentId: number | null;
  physics: PlantPhysics;
  fall: FallTracker;
  view: PlantView | null;
}

/**
 * Consulte le planificateur et pose, s'il y a lieu, l'échéance de maturité du fruit en cours.
 * `ripenAt` garde la FIN de la rampe ; le planificateur en donne le DÉBUT.
 */
function schedule(st: PlantState, tomatoes: readonly Tomato[], simTimeS: number): void {
  const next = nextRipeningStart({ simTimeS: simTimeS - st.startedAtS, tomatoes, currentId: st.currentId });
  st.currentId = next.currentId;
  if (next.currentId !== null && next.startAtS !== null) {
    st.ripenAt.set(next.currentId, st.startedAtS + next.startAtS + RIPEN_DURATION_S);
  }
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
    st.startedAtS = simTimeS;
    st.currentId = null;
    for (const t of spec.tomatoes) st.specById.set(t.id, t);
    ctx.registry.plantSpec = spec;
    st.physics.clear();
    st.fall.reset();
    // Les `ripenAtS` de `generatePlant` ne sont plus que des valeurs par défaut : le planificateur décide.
    const tomatoes = spec.tomatoes.map((t) => tomatoFromSpec(t, NEVER_S, 0));
    for (const t of tomatoes) st.physics.attach(t.id, t.positionCm, t.radiusCm);
    ctx.store.update((s) => ({ ...s, seed, tomatoes, targetTomatoId: null }));
    schedule(st, tomatoes, simTimeS);
    st.view?.setSpec(spec);
    st.view?.sync(tomatoes);
    return spec;
  }

  /** Mûrit les attachées, suit les détachées, pousse la vue, puis décide les chutes et émet tomato_landed. */
  function refresh(ctx: SimContext, st: PlantState, dtSimS: number): void {
    const s = ctx.store.get();
    schedule(st, s.tomatoes, s.simTimeS);
    const tomatoes = s.tomatoes.map((t) => {
      const spec = st.specById.get(t.id);
      if (!spec) return t;
      if (t.attached) return ripenTomato(t, spec, st.ripenAt.get(t.id) ?? NEVER_S, s.simTimeS);
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
        startedAtS: ctx.store.get().simTimeS,
        currentId: null,
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
          const id = ripenNextTarget(s.tomatoes, st.currentId);
          if (id === null) return fail(s, 'not_available', 'no unripe tomato left on the plant');
          // Le fruit visé devient le fruit en cours : le planificateur reprendra la suite après sa coupe.
          st.currentId = id;
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
