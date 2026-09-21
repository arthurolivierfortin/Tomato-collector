import { Vector3 } from 'three';
import type { Vec3 } from '@tomato/shared';

/** Monde (X droite, Y arrière, Z haut, cm) → Three.js (Y haut), 1 unité = 1 cm. */
export function worldToThree(v: Vec3): Vector3 {
  return new Vector3(v[0], v[2], -v[1]);
}

/** Three.js → monde. Un point structurel suffit : la caméra d'un cadrage n'a pas à être un `Vector3`. */
export function threeToWorld(v: { x: number; y: number; z: number }): Vec3 {
  return [v.x, -v.z, v.y];
}
