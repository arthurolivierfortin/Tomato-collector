import { vlen, vsub } from '@tomato/shared';
import type { Vec3 } from '@tomato/shared';

/** Hauteur minimale du point de coupe (sol, fond du panier). */
export const MIN_Z_CM = 5;

export const distanceFromBase = (baseCm: Vec3, pointCm: Vec3): number => vlen(vsub(pointCm, baseCm));

/** Portée grossière exposée à l'agent : sphère de rayon reachCm autour de la base, au-dessus de MIN_Z_CM. */
export function isReachable(baseCm: Vec3, reachCm: number, pointCm: Vec3): boolean {
  return distanceFromBase(baseCm, pointCm) <= reachCm && pointCm[2] >= MIN_Z_CM;
}
