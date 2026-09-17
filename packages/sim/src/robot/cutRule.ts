import { vlen, vsub } from '@tomato/shared';
import type { ScissorsPose, Vec3 } from '@tomato/shared';
import { angleBetweenDeg, distancePointSegment } from './geometry';

/** Distance max entre le point de coupe et le pédoncule pour couper. */
export const CUT_TOLERANCE_CM = 0.6;
/** Angle max entre le pédoncule et la normale au plan des lames (la tige doit traverser le plan). */
export const CUT_MAX_NORMAL_ANGLE_DEG = 45;
/** Rayon en deçà duquel on parle de « misaligned » (tige) ou de « leaf_cut » (feuille). */
export const NEAR_CM = 3;

export interface StemSegment {
  id: number;
  fromCm: Vec3;
  toCm: Vec3;
}

export interface LeafObstacle {
  positionCm: Vec3;
  sizeCm: number;
}

export type CutOutcome = 'stem_cut' | 'misaligned' | 'leaf_cut' | 'nothing_between_blades';

export interface CutEvaluation {
  result: CutOutcome;
  /** Non nul seulement pour stem_cut et misaligned. */
  tomatoId: number | null;
  /** Distance du point de coupe à la tige cible (Infinity sans tige). */
  distanceCm: number;
  /** Angle entre la tige cible et bladeNormal (0 sans tige). */
  angleDeg: number;
}

interface Measured {
  stem: StemSegment;
  distanceCm: number;
  angleDeg: number;
}

function measure(pose: ScissorsPose, stem: StemSegment): Measured {
  return {
    stem,
    distanceCm: distancePointSegment(pose.cutPointCm, stem.fromCm, stem.toCm),
    angleDeg: angleBetweenDeg(vsub(stem.toCm, stem.fromCm), pose.bladeNormal),
  };
}

function leafNear(pose: ScissorsPose, leaves: LeafObstacle[]): boolean {
  return leaves.some((l) => vlen(vsub(pose.cutPointCm, l.positionCm)) - l.sizeCm / 2 <= NEAR_CM);
}

/** Règle de coupe pure : cible = targetId si présent, sinon la tige la plus proche du point de coupe. */
export function evaluateCut(
  pose: ScissorsPose,
  stems: StemSegment[],
  leaves: LeafObstacle[],
  targetId: number | null,
): CutEvaluation {
  const measured = stems.map((s) => measure(pose, s));
  const byId = targetId === null ? undefined : measured.find((m) => m.stem.id === targetId);
  const nearest = measured.reduce<Measured | undefined>(
    (best, m) => (best === undefined || m.distanceCm < best.distanceCm ? m : best),
    undefined,
  );
  const target = byId ?? nearest;
  if (target !== undefined) {
    const { distanceCm, angleDeg } = target;
    if (distanceCm <= CUT_TOLERANCE_CM && angleDeg < CUT_MAX_NORMAL_ANGLE_DEG) {
      return { result: 'stem_cut', tomatoId: target.stem.id, distanceCm, angleDeg };
    }
    if (distanceCm <= NEAR_CM) {
      return { result: 'misaligned', tomatoId: target.stem.id, distanceCm, angleDeg };
    }
  }
  return {
    result: leafNear(pose, leaves) ? 'leaf_cut' : 'nothing_between_blades',
    tomatoId: null,
    distanceCm: target?.distanceCm ?? Number.POSITIVE_INFINITY,
    angleDeg: target?.angleDeg ?? 0,
  };
}
