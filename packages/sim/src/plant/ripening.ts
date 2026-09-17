import type { TomatoState } from '@tomato/shared';

/** Durée de la rampe vert → rouge avant l'instant de maturité, en secondes sim. */
export const RIPEN_DURATION_S = 15;
/** Le rayon du fruit passe de ×1.0 (vert) à ×(1 + RADIUS_GROWTH) (mûr). */
export const RADIUS_GROWTH = 0.3;

const TURNING_AT = 0.35;
const RIPE_AT = 0.9;

/** Maturité 0..1 d'un fruit dont l'instant de maturité est ripenAtS, à l'instant simTimeS. */
export function ripenessAt(ripenAtS: number, simTimeS: number): number {
  const r = (simTimeS - (ripenAtS - RIPEN_DURATION_S)) / RIPEN_DURATION_S;
  return Math.min(1, Math.max(0, r));
}

export function stateFromRipeness(ripeness: number): TomatoState {
  if (ripeness < TURNING_AT) return 'unripe';
  if (ripeness < RIPE_AT) return 'turning';
  return 'ripe';
}

export function radiusScale(ripeness: number): number {
  return 1 + RADIUS_GROWTH * ripeness;
}
