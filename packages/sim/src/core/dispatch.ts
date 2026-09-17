import { fail } from '@tomato/shared';
import type { ActionResult, SimAction } from '@tomato/shared';
import type { SimContext, SimModule } from './module';

/** Route une action vers le premier module qui la prend en charge. */
export function applyAction(modules: SimModule[], action: SimAction, ctx: SimContext): ActionResult {
  for (const m of modules) {
    const r = m.handle?.(action, ctx);
    if (r) return r;
  }
  return fail(ctx.store.get(), 'not_available', `No module handles action ${action.type}`);
}
