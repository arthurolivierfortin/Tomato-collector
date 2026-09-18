import { fail } from '@tomato/shared';
import type { ActionResult, SimAction } from '@tomato/shared';
import type { SimContext, SimModule } from './module';

const unhandled = (action: SimAction, ctx: SimContext): ActionResult =>
  fail(ctx.store.get(), 'not_available', `No module handles action ${action.type}`);

/**
 * Route une action vers le premier module qui la prend en charge, en préférant sa variante animée.
 * Les mouvements (issue #21) ne résolvent leur promesse qu'une fois le déplacement terminé.
 */
export function applyAction(modules: SimModule[], action: SimAction, ctx: SimContext): Promise<ActionResult> {
  for (const m of modules) {
    const animated = m.handleAnimated?.(action, ctx);
    if (animated) return animated;
    const r = m.handle?.(action, ctx);
    if (r) return Promise.resolve(r);
  }
  return Promise.resolve(unhandled(action, ctx));
}

/** Même routage, sans animation : la pose finale est posée d'un coup et le résultat rendu tout de suite. */
export function applyActionNow(modules: SimModule[], action: SimAction, ctx: SimContext): ActionResult {
  for (const m of modules) {
    const r = m.handle?.(action, ctx);
    if (r) return r;
  }
  return unhandled(action, ctx);
}
