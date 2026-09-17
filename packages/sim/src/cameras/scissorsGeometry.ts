import { vadd, vnorm, vscale, vsub, type ScissorsPose, type Vec3 } from '@tomato/shared';
import { rotateAroundAxis } from './ortho';

/** Longueur des lames (contrat Étape 2 : lames de 6 cm, pivot = point de coupe − axe · 3). */
export const BLADE_LENGTH_CM = 6;
/** Longueur des axes dessinés (axe lame, normale) à partir du point de coupe. */
export const AXIS_GLYPH_CM = 8;

export interface ScissorsPoints {
  pivot: Vec3;
  tipA: Vec3;
  tipB: Vec3;
  cutPoint: Vec3;
  axisEnd: Vec3;
  normalEnd: Vec3;
}

/** Points du schéma des ciseaux, calculés localement pour ne pas dépendre des fichiers de M2. */
export function scissorsPoints(s: ScissorsPose): ScissorsPoints {
  const axis = vnorm(s.bladeAxis);
  const normal = vnorm(s.bladeNormal);
  const pivot = vsub(s.cutPointCm, vscale(axis, BLADE_LENGTH_CM / 2));
  const half = s.openingDeg / 2;
  return {
    pivot,
    tipA: vadd(pivot, vscale(rotateAroundAxis(axis, normal, half), BLADE_LENGTH_CM)),
    tipB: vadd(pivot, vscale(rotateAroundAxis(axis, normal, -half), BLADE_LENGTH_CM)),
    cutPoint: s.cutPointCm,
    axisEnd: vadd(s.cutPointCm, vscale(axis, AXIS_GLYPH_CM)),
    normalEnd: vadd(s.cutPointCm, vscale(normal, AXIS_GLYPH_CM)),
  };
}
