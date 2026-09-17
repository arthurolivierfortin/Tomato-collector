import { describe, expect, it } from 'vitest';
import { DEFAULT_LIMITS, vlen, vsub } from '@tomato/shared';
import type { Vec3 } from '@tomato/shared';
import { FORE_CM, SHOULDER_Z_CM, UPPER_CM, armJoints, forwardKinematics, solveIk } from './ik';

const base = DEFAULT_LIMITS.scissorsBaseCm; // [60, -30, 0]

function expectVec(actual: Vec3, expected: Vec3): void {
  expect(actual[0]).toBeCloseTo(expected[0], 6);
  expect(actual[1]).toBeCloseTo(expected[1], 6);
  expect(actual[2]).toBeCloseTo(expected[2], 6);
}

describe('solveIk / forwardKinematics', () => {
  it('uses the dimensions of the architecture document', () => {
    expect([SHOULDER_Z_CM, UPPER_CM, FORE_CM]).toEqual([20, 55, 55]);
    expect(UPPER_CM + FORE_CM).toBe(DEFAULT_LIMITS.scissorsReachCm);
  });

  it('round-trips wrist positions across the workspace', () => {
    const wrists: Vec3[] = [[0, 0, 60], [20, -10, 30], [40, -40, 90], [60, -30, 120], [48, -35, 60]];
    for (const w of wrists) {
      const angles = solveIk(base, w);
      expect(angles).not.toBeNull();
      expectVec(forwardKinematics(base, angles!), w);
    }
  });

  it('returns null beyond the two links or at the shoulder itself', () => {
    expect(solveIk(base, [-30, 30, 80])).toBeNull(); // 123.7 cm de l'épaule
    expect(solveIk(base, [60, -30, SHOULDER_Z_CM])).toBeNull();
  });

  it('stretches the arm straight at full reach and points the base at the wrist', () => {
    const straight = solveIk(base, [60 + 110, -30, SHOULDER_Z_CM])!;
    expect(straight.baseYawDeg).toBeCloseTo(0, 6);
    expect(straight.shoulderDeg).toBeCloseTo(0, 6);
    expect(straight.elbowDeg).toBeCloseTo(0, 6);
    const towardPlant = solveIk(base, [0, -30, SHOULDER_Z_CM])!;
    expect(towardPlant.baseYawDeg).toBeCloseTo(180, 6);
    expect(towardPlant.elbowDeg).toBeGreaterThan(0);
  });

  it('keeps the links at their lengths and the elbow above the chord (elbow-up)', () => {
    const w: Vec3 = [0, 0, 60];
    const j = armJoints(base, solveIk(base, w)!);
    expectVec(j.shoulderCm, [60, -30, 20]);
    expect(vlen(vsub(j.elbowCm, j.shoulderCm))).toBeCloseTo(UPPER_CM, 6);
    expect(vlen(vsub(j.wristCm, j.elbowCm))).toBeCloseTo(FORE_CM, 6);
    expect(j.elbowCm[2]).toBeGreaterThan((j.shoulderCm[2] + w[2]) / 2);
  });
});
