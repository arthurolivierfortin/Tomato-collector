import { degToRad, radToDeg } from '@tomato/shared';
import type { Vec3 } from '@tomato/shared';

/** Hauteur de l'épaule au-dessus de la base. */
export const SHOULDER_Z_CM = 20;
/** Longueur du bras (épaule → coude). */
export const UPPER_CM = 55;
/** Longueur de l'avant-bras (coude → poignet). */
export const FORE_CM = 55;
const EPS = 1e-6;

export interface ArmAngles {
  /** Rotation de la base autour de Z (atan2 dans XY), degrés. */
  baseYawDeg: number;
  /** Élévation du bras au-dessus de l'horizontale, degrés. */
  shoulderDeg: number;
  /** Pliage du coude : 0 = tendu, positif = avant-bras rabattu (coude en haut), degrés. */
  elbowDeg: number;
}

export interface ArmJoints {
  shoulderCm: Vec3;
  elbowCm: Vec3;
  wristCm: Vec3;
}

const clampCos = (c: number): number => Math.min(1, Math.max(-1, c));

export const shoulderPosition = (baseCm: Vec3): Vec3 => [baseCm[0], baseCm[1], baseCm[2] + SHOULDER_Z_CM];

/** IK analytique : lacet de base, puis deux maillons dans le plan vertical passant par l'épaule et le poignet. */
export function solveIk(baseCm: Vec3, wristCm: Vec3): ArmAngles | null {
  const sh = shoulderPosition(baseCm);
  const dx = wristCm[0] - sh[0];
  const dy = wristCm[1] - sh[1];
  const dz = wristCm[2] - sh[2];
  const r = Math.hypot(dx, dy);
  const d = Math.hypot(r, dz);
  if (d < EPS || d > UPPER_CM + FORE_CM + EPS) return null;
  const upperToChord = Math.acos(clampCos((UPPER_CM ** 2 + d ** 2 - FORE_CM ** 2) / (2 * UPPER_CM * d)));
  const innerElbow = Math.acos(clampCos((UPPER_CM ** 2 + FORE_CM ** 2 - d ** 2) / (2 * UPPER_CM * FORE_CM)));
  return {
    baseYawDeg: radToDeg(Math.atan2(dy, dx)),
    shoulderDeg: radToDeg(Math.atan2(dz, r) + upperToChord),
    elbowDeg: 180 - radToDeg(innerElbow),
  };
}

/** Cinématique directe : positions de l'épaule, du coude et du poignet. */
export function armJoints(baseCm: Vec3, angles: ArmAngles): ArmJoints {
  const sh = shoulderPosition(baseCm);
  const yaw = degToRad(angles.baseYawDeg);
  const s = degToRad(angles.shoulderDeg);
  const f = s - degToRad(angles.elbowDeg);
  const radial = (r: number, z: number): Vec3 => [sh[0] + r * Math.cos(yaw), sh[1] + r * Math.sin(yaw), sh[2] + z];
  const elbowCm = radial(UPPER_CM * Math.cos(s), UPPER_CM * Math.sin(s));
  const wristCm = radial(UPPER_CM * Math.cos(s) + FORE_CM * Math.cos(f), UPPER_CM * Math.sin(s) + FORE_CM * Math.sin(f));
  return { shoulderCm: sh, elbowCm, wristCm };
}

export const forwardKinematics = (baseCm: Vec3, angles: ArmAngles): Vec3 => armJoints(baseCm, angles).wristCm;
