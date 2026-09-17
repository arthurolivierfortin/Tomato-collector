import { radToDeg, vadd, vdot, vlen, vscale, vsub } from '@tomato/shared';
import type { Vec3 } from '@tomato/shared';

const EPS = 1e-9;
const clamp01 = (t: number): number => Math.min(1, Math.max(0, t));

export interface ClosestOnSegment {
  pointCm: Vec3;
  /** Paramètre 0..1 le long de [a, b]. */
  t: number;
  distanceCm: number;
}

export function closestPointOnSegment(p: Vec3, a: Vec3, b: Vec3): ClosestOnSegment {
  const ab = vsub(b, a);
  const l2 = vdot(ab, ab);
  const t = l2 <= EPS ? 0 : clamp01(vdot(vsub(p, a), ab) / l2);
  const pointCm = vadd(a, vscale(ab, t));
  return { pointCm, t, distanceCm: vlen(vsub(p, pointCm)) };
}

export const distancePointSegment = (p: Vec3, a: Vec3, b: Vec3): number => closestPointOnSegment(p, a, b).distanceCm;

export interface ClosestSegments {
  /** Paramètre sur [p1, q1]. */
  s: number;
  /** Paramètre sur [p2, q2]. */
  t: number;
  aCm: Vec3;
  bCm: Vec3;
  distanceCm: number;
}

/** Points les plus proches entre [p1, q1] et [p2, q2] (Ericson, Real-Time Collision Detection 5.1.9). */
export function closestPointsSegments(p1: Vec3, q1: Vec3, p2: Vec3, q2: Vec3): ClosestSegments {
  const d1 = vsub(q1, p1);
  const d2 = vsub(q2, p2);
  const r = vsub(p1, p2);
  const a = vdot(d1, d1);
  const e = vdot(d2, d2);
  const f = vdot(d2, r);
  let s = 0;
  let t = 0;
  if (a <= EPS && e <= EPS) {
    // deux points : s = t = 0
  } else if (a <= EPS) {
    t = clamp01(f / e);
  } else {
    const c = vdot(d1, r);
    if (e <= EPS) {
      s = clamp01(-c / a);
    } else {
      const b = vdot(d1, d2);
      const denom = a * e - b * b;
      s = denom > EPS ? clamp01((b * f - c * e) / denom) : 0;
      t = (b * s + f) / e;
      if (t < 0) {
        t = 0;
        s = clamp01(-c / a);
      } else if (t > 1) {
        t = 1;
        s = clamp01((b - c) / a);
      }
    }
  }
  const aCm = vadd(p1, vscale(d1, s));
  const bCm = vadd(p2, vscale(d2, t));
  return { s, t, aCm, bCm, distanceCm: vlen(vsub(aCm, bCm)) };
}

export const distanceSegmentSegment = (a1: Vec3, a2: Vec3, b1: Vec3, b2: Vec3): number =>
  closestPointsSegments(a1, a2, b1, b2).distanceCm;

/** Angle entre deux directions (sens ignoré), en degrés dans [0, 90]. 0 si un vecteur est nul. */
export function angleBetweenDeg(u: Vec3, v: Vec3): number {
  const lu = vlen(u);
  const lv = vlen(v);
  if (lu <= EPS || lv <= EPS) return 0;
  const c = Math.min(1, Math.abs(vdot(u, v)) / (lu * lv));
  return radToDeg(Math.acos(c));
}
