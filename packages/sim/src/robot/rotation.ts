import { degToRad, vdot } from '@tomato/shared';
import type { Vec3 } from '@tomato/shared';

/** Matrice 3×3 stockée par lignes. */
export type Mat3 = readonly [Vec3, Vec3, Vec3];

export const cross = (a: Vec3, b: Vec3): Vec3 => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];

export function rotX(deg: number): Mat3 {
  const c = Math.cos(degToRad(deg));
  const s = Math.sin(degToRad(deg));
  return [[1, 0, 0], [0, c, -s], [0, s, c]];
}

export function rotY(deg: number): Mat3 {
  const c = Math.cos(degToRad(deg));
  const s = Math.sin(degToRad(deg));
  return [[c, 0, s], [0, 1, 0], [-s, 0, c]];
}

export function rotZ(deg: number): Mat3 {
  const c = Math.cos(degToRad(deg));
  const s = Math.sin(degToRad(deg));
  return [[c, -s, 0], [s, c, 0], [0, 0, 1]];
}

export const applyRot = (m: Mat3, v: Vec3): Vec3 => [vdot(m[0], v), vdot(m[1], v), vdot(m[2], v)];

export function mulMat(a: Mat3, b: Mat3): Mat3 {
  const c0: Vec3 = [b[0][0], b[1][0], b[2][0]];
  const c1: Vec3 = [b[0][1], b[1][1], b[2][1]];
  const c2: Vec3 = [b[0][2], b[1][2], b[2][2]];
  const row = (r: Vec3): Vec3 => [vdot(r, c0), vdot(r, c1), vdot(r, c2)];
  return [row(a[0]), row(a[1]), row(a[2])];
}

/** Orientation des ciseaux : Rz(lacet) · Ry(tangage) · Rx(roulis), appliquée aux vecteurs de base. */
export function composeZYX(yawDeg: number, pitchDeg: number, rollDeg: number): Mat3 {
  return mulMat(rotZ(yawDeg), mulMat(rotY(pitchDeg), rotX(rollDeg)));
}

/** Formule de Rodrigues : rotation de v de `deg` autour de l'axe unitaire k. */
export function rotateAroundAxis(v: Vec3, k: Vec3, deg: number): Vec3 {
  const c = Math.cos(degToRad(deg));
  const s = Math.sin(degToRad(deg));
  const kv = cross(k, v);
  const d = vdot(k, v) * (1 - c);
  return [v[0] * c + kv[0] * s + k[0] * d, v[1] * c + kv[1] * s + k[1] * d, v[2] * c + kv[2] * s + k[2] * d];
}

/** Lames pointant vers le plant (−X) depuis la base du bras en +X, plan des lames horizontal. */
export const BASE_BLADE_AXIS: Vec3 = [-1, 0, 0];
export const BASE_BLADE_NORMAL: Vec3 = [0, 0, 1];

export interface OrientationVectors {
  bladeAxis: Vec3;
  bladeNormal: Vec3;
  transverse: Vec3;
}

export function orientationVectors(yawDeg: number, pitchDeg: number, rollDeg: number): OrientationVectors {
  const m = composeZYX(yawDeg, pitchDeg, rollDeg);
  const bladeAxis = applyRot(m, BASE_BLADE_AXIS);
  const bladeNormal = applyRot(m, BASE_BLADE_NORMAL);
  return { bladeAxis, bladeNormal, transverse: cross(bladeNormal, bladeAxis) };
}
