import type { BasketPose, Vec3 } from '@tomato/shared';

export type LandingOutcome = 'in_basket' | 'floor' | 'airborne';

/** En dessous de cette vitesse la tomate est considérée au repos. */
export const REST_SPEED_CM_S = 2;
/** Délai maximal après la coupe avant de décider quoi qu'il arrive. */
export const LANDING_TIMEOUT_S = 3;
/** Temps de chute minimal avant d'accepter une décision « au repos » (la vitesse est nulle à la frame de la coupe). */
export const MIN_AIRBORNE_S = 0.25;
/** Marge au-dessus du sol pour déclarer un contact sol. */
export const FLOOR_MARGIN_CM = 0.5;

/** Règle pure du contrat : où est le centre du fruit par rapport au panier et au sol. */
export function landingOutcome(posCm: Vec3, radiusCm: number, basket: BasketPose): LandingOutcome {
  const [x, y, z] = posCm;
  const [cx, cy, floorZ] = basket.centerCm;
  const [w, d] = basket.sizeCm;
  const insideXY = Math.abs(x - cx) <= w / 2 && Math.abs(y - cy) <= d / 2;
  if (insideXY && z >= floorZ && z <= floorZ + basket.depthCm + radiusCm) return 'in_basket';
  if (!insideXY && z <= radiusCm + FLOOR_MARGIN_CM) return 'floor';
  return 'airborne';
}

/** Décision au repos (après un temps de chute minimal) ou après le délai. */
export function shouldDecide(speedCmS: number, airborneS: number): boolean {
  if (airborneS >= LANDING_TIMEOUT_S) return true;
  return airborneS >= MIN_AIRBORNE_S && speedCmS < REST_SPEED_CM_S;
}
