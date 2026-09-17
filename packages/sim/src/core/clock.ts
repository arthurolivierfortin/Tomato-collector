import { fail, ok } from '@tomato/shared';
import type { SimModule } from './module';

/**
 * Horloge de la sim : temps sim = temps réel × timeScale, gelé en pause.
 * Doit être le PREMIER module de la liste : son update reçoit le dt réel et
 * publie le dt sim que la boucle transmet aux autres modules.
 */
export const clockModule: SimModule & { lastDtSimS: number } = {
  name: 'clock',
  lastDtSimS: 0,
  init: () => undefined,
  update(dtRealS, ctx) {
    const s = ctx.store.get();
    const dtSim = s.paused ? 0 : dtRealS * s.timeScale;
    clockModule.lastDtSimS = dtSim;
    if (dtSim > 0) ctx.store.update((st) => ({ ...st, simTimeS: st.simTimeS + dtSim }));
  },
  handle(action, ctx) {
    const s = ctx.store.get();
    switch (action.type) {
      case 'set_time_scale':
        if (!(action.scale > 0)) return fail(s, 'invalid_argument', 'time scale must be > 0');
        ctx.store.update((st) => ({ ...st, timeScale: action.scale }));
        return ok(ctx.store.get(), `time scale ${action.scale}`);
      case 'set_paused':
        ctx.store.update((st) => ({ ...st, paused: action.paused }));
        return ok(ctx.store.get(), action.paused ? 'paused' : 'running');
      case 'set_target':
        ctx.store.update((st) => ({ ...st, targetTomatoId: action.tomatoId }));
        return ok(ctx.store.get(), `target tomato ${action.tomatoId ?? 'none'}`);
      default:
        return null;
    }
  },
};
