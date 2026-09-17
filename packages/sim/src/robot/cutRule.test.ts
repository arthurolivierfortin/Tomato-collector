import { describe, expect, it } from 'vitest';
import type { Vec3 } from '@tomato/shared';
import { CUT_MAX_NORMAL_ANGLE_DEG, CUT_TOLERANCE_CM, NEAR_CM, evaluateCut } from './cutRule';
import type { StemSegment } from './cutRule';
import { poseFromAngles } from './scissorsGeometry';

const CUT: Vec3 = [0, 0, 50];
const open = (yaw = 0, pitch = 0, roll = 0) => poseFromAngles(CUT, yaw, pitch, roll, 60);
/** Pédoncule vertical de 10 cm centré en z = 50, décalé de dy en Y. */
const vertical = (id: number, dy: number): StemSegment => ({ id, fromCm: [0, dy, 55], toCm: [0, dy, 45] });

describe('evaluateCut', () => {
  it('exposes the tolerances of the architecture document', () => {
    expect(CUT_TOLERANCE_CM).toBe(0.6);
    expect(CUT_MAX_NORMAL_ANGLE_DEG).toBe(45);
    expect(NEAR_CM).toBe(3);
  });

  it('cuts a vertical stem through the cut point with horizontal blades', () => {
    const r = evaluateCut(open(), [vertical(1, 0)], [], null);
    expect(r).toEqual({ result: 'stem_cut', tomatoId: 1, distanceCm: 0, angleDeg: 0 });
  });

  it('cuts within 0.6 cm and reports misaligned beyond, with the measured distance', () => {
    expect(evaluateCut(open(), [vertical(1, 0.5)], [], null).result).toBe('stem_cut');
    const r = evaluateCut(open(), [vertical(1, 1.5)], [], null);
    expect(r.result).toBe('misaligned');
    expect(r.tomatoId).toBe(1);
    expect(r.distanceCm).toBeCloseTo(1.5, 9);
    expect(r.angleDeg).toBeCloseTo(0, 9);
  });

  it('reports misaligned when the stem lies in the blade plane (angle 90 from the normal)', () => {
    const r = evaluateCut(open(0, 90, 0), [vertical(1, 0)], [], null);
    expect(r.result).toBe('misaligned');
    expect(r.distanceCm).toBeCloseTo(0, 9);
    expect(r.angleDeg).toBeCloseTo(90, 6);
    const horizontal: StemSegment = { id: 2, fromCm: [-5, 0, 50], toCm: [5, 0, 50] };
    expect(evaluateCut(open(), [horizontal], [], null).result).toBe('misaligned');
  });

  it('accepts a stem 44 deg from the normal and refuses one at 46 deg', () => {
    const tilted = (deg: number): StemSegment => {
      const rad = (deg * Math.PI) / 180;
      const d: Vec3 = [Math.sin(rad) * 5, 0, Math.cos(rad) * 5];
      return { id: 1, fromCm: [CUT[0] - d[0], CUT[1] - d[1], CUT[2] - d[2]], toCm: [CUT[0] + d[0], CUT[1] + d[1], CUT[2] + d[2]] };
    };
    expect(evaluateCut(open(), [tilted(44)], [], null).result).toBe('stem_cut');
    const r = evaluateCut(open(), [tilted(46)], [], null);
    expect(r.result).toBe('misaligned');
    expect(r.angleDeg).toBeCloseTo(46, 6);
  });

  it('honours the target id even when another stem is closer', () => {
    const stems = [vertical(1, 0.2), vertical(2, 2)];
    const target = evaluateCut(open(), stems, [], 2);
    expect(target.result).toBe('misaligned');
    expect(target.tomatoId).toBe(2);
    expect(target.distanceCm).toBeCloseTo(2, 9);
    expect(evaluateCut(open(), stems, [], null)).toMatchObject({ result: 'stem_cut', tomatoId: 1 });
    expect(evaluateCut(open(), stems, [], 99)).toMatchObject({ result: 'stem_cut', tomatoId: 1 });
  });

  it('reports leaf_cut when only a leaf is near, nothing_between_blades otherwise', () => {
    const far = [vertical(1, 5)];
    const leaf = evaluateCut(open(), far, [{ positionCm: [0, 2, 50], sizeCm: 10 }], null);
    expect(leaf.result).toBe('leaf_cut');
    expect(leaf.tomatoId).toBeNull();
    expect(leaf.distanceCm).toBeCloseTo(5, 9);
    const nothing = evaluateCut(open(), far, [{ positionCm: [0, 20, 50], sizeCm: 10 }], null);
    expect(nothing.result).toBe('nothing_between_blades');
    expect(nothing.tomatoId).toBeNull();
    expect(nothing.distanceCm).toBeCloseTo(5, 9);
  });

  it('returns an infinite distance when there is no stem at all', () => {
    const r = evaluateCut(open(), [], [], null);
    expect(r).toEqual({ result: 'nothing_between_blades', tomatoId: null, distanceCm: Number.POSITIVE_INFINITY, angleDeg: 0 });
  });
});
