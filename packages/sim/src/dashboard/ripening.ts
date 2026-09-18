import type { WorldState } from '@tomato/shared';
import { formatNum } from './traceFormat';

/** Tomate dont la rampe de maturité tourne, telle que la lit le bandeau de statuts. */
export interface Ripening {
  tomatoId: number;
  /** 0 = verte, 1 = mûre. */
  ripeness: number;
}

/**
 * La tomate en cours de mûrissement (issue #23 : une seule à la fois, cf. `plant/ripeningSchedule`).
 *
 * On prend celle qui pend et dont la rampe est entamée sans être finie ; à défaut, la mûre encore
 * attachée, qui attend d'être coupée. Le spectateur voit ainsi la barre monter avant la détection,
 * puis « mûre » pendant l'épisode.
 */
export function ripeningOf(state: WorldState): Ripening | null {
  let running: Ripening | null = null;
  let ripe: Ripening | null = null;
  for (const t of state.tomatoes) {
    if (!t.attached) continue;
    if (t.ripeness >= 1) ripe ??= { tomatoId: t.id, ripeness: 1 };
    else if (t.ripeness > 0 && (running === null || t.ripeness > running.ripeness)) running = { tomatoId: t.id, ripeness: t.ripeness };
  }
  return running ?? ripe;
}

/**
 * « tomate 3 : mûrit 62 % », « tomate 3 : mûre », « aucun » quand rien ne mûrit.
 *
 * Le mot plutôt qu'un tiret cadratin : le bandeau est filmé, et un « — » se lit mal à l'image
 * (revue de la vidéo v2 ; aucun tiret long dans les libellés visibles).
 */
export function formatRipening(r: Ripening | null): string {
  if (r === null) return 'aucun';
  return r.ripeness >= 1 ? `tomate ${r.tomatoId} : mûre` : `tomate ${r.tomatoId} : mûrit ${formatNum(r.ripeness * 100)} %`;
}
