import { vlen, vsub } from '@tomato/shared';
import type { Vec3 } from '@tomato/shared';
import { closestPointOnSegment, closestPointsSegments, distancePointSegment } from './geometry';

/** Marge de sécurité autour des tomates et de la tige principale. */
export const COLLISION_MARGIN_CM = 0.5;
const EPS = 1e-6;

export interface TomatoObstacle {
  id: number;
  positionCm: Vec3;
  radiusCm: number;
}

export type PathCheck =
  | { blocked: false }
  | { blocked: true; what: 'tomato' | 'stem'; id?: number; atCm: Vec3 };

interface Hit {
  /** Paramètre 0..1 le long du trajet, pour ordonner les obstacles. */
  t: number;
  what: 'tomato' | 'stem';
  id: number | null;
  atCm: Vec3;
}

/** Bloque si le trajet entre dans la marge, sauf s'il part déjà dedans et ne s'approche pas davantage. */
function enters(startCm: number, closestCm: number, limitCm: number): boolean {
  if (closestCm >= limitCm) return false;
  return startCm >= limitCm || closestCm < startCm - EPS;
}

export function pathBlocked(
  fromCm: Vec3,
  toCm: Vec3,
  tomatoes: TomatoObstacle[],
  mainStem: Vec3[],
  stemRadiusCm: number,
): PathCheck {
  const hits: Hit[] = [];
  for (const tom of tomatoes) {
    const limit = tom.radiusCm + COLLISION_MARGIN_CM;
    const closest = closestPointOnSegment(tom.positionCm, fromCm, toCm);
    if (enters(vlen(vsub(fromCm, tom.positionCm)), closest.distanceCm, limit)) {
      hits.push({ t: closest.t, what: 'tomato', id: tom.id, atCm: closest.pointCm });
    }
  }
  const stemLimit = stemRadiusCm + COLLISION_MARGIN_CM;
  for (let i = 0; i + 1 < mainStem.length; i++) {
    const a = mainStem[i]!;
    const b = mainStem[i + 1]!;
    const c = closestPointsSegments(fromCm, toCm, a, b);
    if (enters(distancePointSegment(fromCm, a, b), c.distanceCm, stemLimit)) {
      hits.push({ t: c.s, what: 'stem', id: null, atCm: c.aCm });
    }
  }
  if (hits.length === 0) return { blocked: false };
  const first = hits.reduce((best, h) => (h.t < best.t ? h : best));
  return first.id === null
    ? { blocked: true, what: first.what, atCm: first.atCm }
    : { blocked: true, what: first.what, id: first.id, atCm: first.atCm };
}
