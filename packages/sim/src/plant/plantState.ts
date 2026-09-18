import { vnorm, vscale, vsub } from '@tomato/shared';
import type { Tomato, Vec3 } from '@tomato/shared';
import type { PlantSpec, TomatoSpec } from './generatePlant';
import { radiusScale, ripenessAt, stateFromRipeness } from './ripening';

/**
 * Pédoncule du contrat : de l'attache sur la branche (from) à la surface du fruit (to).
 * `radiusCm` est le rayon COURANT du fruit (il grossit en mûrissant) : le point d'attache
 * reste ainsi toujours sur la surface au lieu de se retrouver dans le fruit.
 */
export function stemOf(t: TomatoSpec, radiusCm: number = t.radiusCm): { fromCm: Vec3; toCm: Vec3 } {
  const dir = vnorm(vsub(t.centerCm, t.anchorCm));
  return { fromCm: t.anchorCm, toCm: vsub(t.centerCm, vscale(dir, radiusCm)) };
}

export function tomatoFromSpec(t: TomatoSpec, ripenAtS: number, simTimeS: number): Tomato {
  const ripeness = ripenessAt(ripenAtS, simTimeS);
  const radiusCm = t.radiusCm * radiusScale(ripeness);
  return {
    id: t.id,
    state: stateFromRipeness(ripeness),
    ripeness,
    positionCm: t.centerCm,
    radiusCm,
    stem: stemOf(t, radiusCm),
    attached: true,
    visibleIn: { top: 1, front: 1, side: 1 },
  };
}

export function tomatoesFromSpec(spec: PlantSpec, simTimeS: number): Tomato[] {
  return spec.tomatoes.map((t) => tomatoFromSpec(t, t.ripenAtS, simTimeS));
}

/**
 * Recalcule maturité, état, rayon et point d'attache du pédoncule sur la surface du fruit grossi ;
 * ne touche pas aux champs des autres modules (visibleIn) ni à la position.
 */
export function ripenTomato(tomato: Tomato, spec: TomatoSpec, ripenAtS: number, simTimeS: number): Tomato {
  const ripeness = ripenessAt(ripenAtS, simTimeS);
  const radiusCm = spec.radiusCm * radiusScale(ripeness);
  return { ...tomato, ripeness, state: stateFromRipeness(ripeness), radiusCm, stem: stemOf(spec, radiusCm) };
}
