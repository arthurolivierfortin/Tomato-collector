import type { ActionResult, SimAction, SimEvent, WorldState } from '@tomato/shared';
import type { SceneHandle } from '../three/createScene';
import { clockModule } from './clock';
import { applyAction } from './dispatch';
import type { SimContext, SimModule } from './module';
import { createSignals } from './signals';
import { createWorldStore } from './store';

export interface SimRuntime {
  ctx: SimContext;
  apply(action: SimAction): ActionResult;
  /** Une frame : dt réel en secondes. */
  step(dtRealS: number): void;
  onEvent(fn: (e: SimEvent) => void): () => void;
}

/** Assemble l'horloge et les modules ; la boucle de rendu appelle step() à chaque frame. */
export async function createRuntime(initial: WorldState, scene: SceneHandle | null, modules: SimModule[]): Promise<SimRuntime> {
  const eventListeners = new Set<(e: SimEvent) => void>();
  const ctx: SimContext = {
    store: createWorldStore(initial),
    signals: createSignals(),
    emitEvent: (e) => {
      for (const fn of eventListeners) fn(e);
    },
    scene,
    registry: { plantSpec: null },
  };
  const all = [clockModule, ...modules];
  for (const m of all) await m.init(ctx);
  return {
    ctx,
    apply: (action) => applyAction(all, action, ctx),
    step: (dtRealS) => {
      clockModule.update!(dtRealS, ctx);
      const dtSim = clockModule.lastDtSimS;
      for (const m of modules) m.update?.(dtSim, ctx);
    },
    onEvent: (fn) => {
      eventListeners.add(fn);
      return () => eventListeners.delete(fn);
    },
  };
}
