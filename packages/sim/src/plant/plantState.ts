import { vnorm, vscale, vsub } from '@tomato/shared';
import type { Tomato, Vec3 } from '@tomato/shared';
import type { PlantSpec, TomatoSpec } from './generatePlant';
import { radiusScale, ripenessAt, stateFromRipeness } from './ripening';

/** Pédoncule du contrat : de l'attache sur la branche (from) à la surface du fruit (to). */
export function stemOf(t: TomatoSpec): { fromCm: Vec3; toCm: Vec3 } {
  const dir = vnorm(vsub(t.centerCm, t.anchorCm));
  return { fromCm: t.anchorCm, toCm: vsub(t.centerCm, vscale(dir, t.radiusCm)) };
}

export function tomatoFromSpec(t: TomatoSpec, ripenAtS: number, simTimeS: number): Tomato {
  const ripeness = ripenessAt(ripenAtS, simTimeS);
  return {
    id: t.id,
    state: stateFromRipeness(ripeness),
    ripeness,
    positionCm: t.centerCm,
    radiusCm: t.radiusCm * radiusScale(ripeness),
    stem: stemOf(t),
    attached: true,
    visibleIn: { top: 1, front: 1, side: 1 },
  };
}

export function tomatoesFromSpec(spec: PlantSpec, simTimeS: number): Tomato[] {
  return spec.tomatoes.map((t) => tomatoFromSpec(t, t.ripenAtS, simTimeS));
}

/** Recalcule maturité, état et rayon ; ne touche pas aux champs des autres modules (visibleIn) ni à la position. */
export function ripenTomato(tomato: Tomato, spec: TomatoSpec, ripenAtS: number, simTimeS: number): Tomato {
  const ripeness = ripenessAt(ripenAtS, simTimeS);
  return { ...tomato, ripeness, state: stateFromRipeness(ripeness), radiusCm: spec.radiusCm * radiusScale(ripeness) };
}

/** La prochaine tomate attachée et non mûre : celle dont l'instant de maturité est le plus proche. */
export function nextToRipen(tomatoes: readonly Tomato[], ripenAt: ReadonlyMap<number, number>): number | null {
  let best: number | null = null;
  let bestAt = Infinity;
  for (const t of tomatoes) {
    if (!t.attached || t.state === 'ripe') continue;
    const at = ripenAt.get(t.id) ?? Infinity;
    if (at < bestAt) {
      bestAt = at;
      best = t.id;
    }
  }
  return best;
}
