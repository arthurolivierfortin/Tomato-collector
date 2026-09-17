import { describe, expect, it } from 'vitest';
import { createDefaultWorld, vlen, vsub } from '@tomato/shared';
import type { Vec3 } from '@tomato/shared';
import { BLADE_LENGTH_CM, poseFromAngles, scissorsPoints } from './scissorsGeometry';

function expectVec(actual: Vec3, expected: Vec3): void {
  expect(actual[0]).toBeCloseTo(expected[0], 6);
  expect(actual[1]).toBeCloseTo(expected[1], 6);
  expect(actual[2]).toBeCloseTo(expected[2], 6);
}

describe('scissorsPoints', () => {
  const closed = createDefaultWorld(1).scissors; // cutPoint [45,-35,60], axis [-1,0,0], normal [0,0,1], fermés

  it('puts the pivot 3 cm behind the cut point and both tips 3 cm ahead when closed', () => {
    const p = scissorsPoints(closed);
    expect(BLADE_LENGTH_CM).toBe(6);
    expectVec(p.pivotCm, [48, -35, 60]);
    expectVec(p.tipACm, [42, -35, 60]);
    expectVec(p.tipBCm, [42, -35, 60]);
    expectVec(p.cutPointCm, [45, -35, 60]);
    expectVec(p.transverse, [0, -1, 0]);
  });

  it('opens the tips symmetrically around the blade normal, blades staying 6 cm long', () => {
    const p = scissorsPoints({ ...closed, openingDeg: 60 });
    expectVec(p.pivotCm, [48, -35, 60]);
    expectVec(p.tipACm, [48 - 6 * Math.cos(Math.PI / 6), -38, 60]);
    expectVec(p.tipBCm, [48 - 6 * Math.cos(Math.PI / 6), -32, 60]);
    expect(vlen(vsub(p.tipACm, p.pivotCm))).toBeCloseTo(6, 9);
    expect(vlen(vsub(p.tipBCm, p.pivotCm))).toBeCloseTo(6, 9);
    expect(vlen(vsub(p.tipACm, p.tipBCm))).toBeCloseTo(6, 9);
  });
});

describe('poseFromAngles', () => {
  it('fills bladeAxis and bladeNormal from the angles', () => {
    const pose = poseFromAngles([0, 0, 50], 90, 0, 0, 20);
    expect(pose.cutPointCm).toEqual([0, 0, 50]);
    expect(pose.yawDeg).toBe(90);
    expect(pose.openingDeg).toBe(20);
    expectVec(pose.bladeAxis, [0, -1, 0]);
    expectVec(pose.bladeNormal, [0, 0, 1]);
    expectVec(scissorsPoints(pose).pivotCm, [0, 3, 50]);
  });

  it('with pitch 90 the blades point straight up and the normal points to +X', () => {
    const pose = poseFromAngles([10, 10, 40], 0, 90, 0, 0);
    expectVec(pose.bladeAxis, [0, 0, 1]);
    expectVec(pose.bladeNormal, [1, 0, 0]);
    expectVec(scissorsPoints(pose).pivotCm, [10, 10, 37]);
  });
});
