import { vadd, vscale, vsub } from '@tomato/shared';
import type { ScissorsPose, Vec3 } from '@tomato/shared';
import { cross, orientationVectors, rotateAroundAxis } from './rotation';

/** Longueur de chaque lame ; le point de coupe est au milieu des lames. */
export const BLADE_LENGTH_CM = 6;
/** Ouverture appliquée par open_scissors. */
export const OPENING_DEG = 60;

export interface ScissorsPoints {
  pivotCm: Vec3;
  tipACm: Vec3;
  tipBCm: Vec3;
  cutPointCm: Vec3;
  bladeAxis: Vec3;
  bladeNormal: Vec3;
  transverse: Vec3;
}

/** Points caractéristiques des ciseaux : pivot = cutPoint − bladeAxis·3, pointes à ±ouverture/2 autour de bladeNormal. */
export function scissorsPoints(pose: ScissorsPose): ScissorsPoints {
  const { bladeAxis, bladeNormal, cutPointCm } = pose;
  const pivotCm = vsub(cutPointCm, vscale(bladeAxis, BLADE_LENGTH_CM / 2));
  const half = pose.openingDeg / 2;
  const tipACm = vadd(pivotCm, vscale(rotateAroundAxis(bladeAxis, bladeNormal, half), BLADE_LENGTH_CM));
  const tipBCm = vadd(pivotCm, vscale(rotateAroundAxis(bladeAxis, bladeNormal, -half), BLADE_LENGTH_CM));
  return { pivotCm, tipACm, tipBCm, cutPointCm, bladeAxis, bladeNormal, transverse: cross(bladeNormal, bladeAxis) };
}

/** Pose complète (vecteurs dérivés inclus) à partir du point de coupe et des angles. */
export function poseFromAngles(
  cutPointCm: Vec3,
  yawDeg: number,
  pitchDeg: number,
  rollDeg: number,
  openingDeg: number,
): ScissorsPose {
  const { bladeAxis, bladeNormal } = orientationVectors(yawDeg, pitchDeg, rollDeg);
  return { cutPointCm, yawDeg, pitchDeg, rollDeg, openingDeg, bladeAxis, bladeNormal };
}
