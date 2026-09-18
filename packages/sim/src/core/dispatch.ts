import { fail } from '@tomato/shared';
import type { ActionResult, SimAction } from '@tomato/shared';
import type { HandleOptions, SimContext, SimModule } from './module';

const ANIMATED: HandleOptions = { instant: false };
const INSTANT: HandleOptions = { instant: true };

/**
 * Route une action vers le premier module qui la prend en charge.
 * Les actions animées (issue #21) ne se résolvent qu'à la fin du mouvement : la promesse attend.
 */
export function applyAction(modules: SimModule[], action: SimAction, ctx: SimContext): Promise<ActionResult> {
  for (const m of modules) {
    const r = m.handle?.(action, ctx, ANIMATED);
    if (r) return Promise.resolve(r);
  }
  return Promise.resolve(fail(ctx.store.get(), 'not_available', `No module handles action ${action.type}`));
}

/** Même routage, mais sans animation : la pose finale est posée d'un coup et le résultat rendu tout de suite. */
export function applyActionNow(modules: SimModule[], action: SimAction, ctx: SimContext): ActionResult {
  for (const m of modules) {
    const r = m.handle?.(action, ctx, INSTANT);
    if (!r) continue;
    if (r instanceof Promise) throw new Error(`applyActionNow: le module ${m.name} a répondu de façon asynchrone à ${action.type}`);
    return r;
  }
  return fail(ctx.store.get(), 'not_available', `No module handles action ${action.type}`);
}
