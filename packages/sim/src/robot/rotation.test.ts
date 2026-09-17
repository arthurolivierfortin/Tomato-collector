import { describe, expect, it } from 'vitest';
import { vdot, vlen } from '@tomato/shared';
import type { Vec3 } from '@tomato/shared';
import {
  applyRot, composeZYX, cross, orientationVectors, rotX, rotY, rotZ, rotateAroundAxis,
} from './rotation';

function expectVec(actual: Vec3, expected: Vec3): void {
  expect(actual[0]).toBeCloseTo(expected[0], 6);
  expect(actual[1]).toBeCloseTo(expected[1], 6);
  expect(actual[2]).toBeCloseTo(expected[2], 6);
}

describe('elementary rotations', () => {
  it('rotate the world axes counter-clockwise by the right-hand rule', () => {
    expectVec(applyRot(rotZ(90), [1, 0, 0]), [0, 1, 0]);
    expectVec(applyRot(rotX(90), [0, 1, 0]), [0, 0, 1]);
    expectVec(applyRot(rotY(90), [0, 0, 1]), [1, 0, 0]);
  });

  it('cross product follows the right-hand rule', () => {
    expectVec(cross([1, 0, 0], [0, 1, 0]), [0, 0, 1]);
    expectVec(cross([0, 0, 1], [-1, 0, 0]), [0, -1, 0]);
  });

  it('composeZYX applies roll first, then pitch, then yaw', () => {
    expectVec(applyRot(composeZYX(90, 0, 0), [1, 0, 0]), applyRot(rotZ(90), [1, 0, 0]));
    expectVec(applyRot(composeZYX(0, 90, 0), [-1, 0, 0]), [0, 0, 1]);
    // roll 90 puis yaw 90 : [0,1,0] --Rx--> [0,0,1] --Rz--> [0,0,1]
    expectVec(applyRot(composeZYX(90, 0, 90), [0, 1, 0]), [0, 0, 1]);
  });

  it('rotateAroundAxis matches the matrix rotation for the Z axis', () => {
    expectVec(rotateAroundAxis([1, 0, 0], [0, 0, 1], 90), [0, 1, 0]);
    expectVec(rotateAroundAxis([-1, 0, 0], [0, 0, 1], 30), [-Math.cos(Math.PI / 6), -0.5, 0]);
  });
});

describe('orientationVectors', () => {
  it('starts with the blades pointing to -X and a horizontal blade plane', () => {
    const o = orientationVectors(0, 0, 0);
    expectVec(o.bladeAxis, [-1, 0, 0]);
    expectVec(o.bladeNormal, [0, 0, 1]);
    expectVec(o.transverse, [0, -1, 0]);
  });

  it('yaw 90 turns the blade axis to -Y and keeps the plane horizontal', () => {
    const o = orientationVectors(90, 0, 0);
    expectVec(o.bladeAxis, [0, -1, 0]);
    expectVec(o.bladeNormal, [0, 0, 1]);
  });

  it('pitch 30 tilts the blade axis toward +Z', () => {
    const o = orientationVectors(0, 30, 0);
    expectVec(o.bladeAxis, [-Math.cos(Math.PI / 6), 0, 0.5]);
    expectVec(o.bladeNormal, [0.5, 0, Math.cos(Math.PI / 6)]);
  });

  it('roll 45 leaves the blade axis unchanged and tilts the normal', () => {
    const o = orientationVectors(0, 0, 45);
    expectVec(o.bladeAxis, [-1, 0, 0]);
    expectVec(o.bladeNormal, [0, -Math.SQRT1_2, Math.SQRT1_2]);
  });

  it('keeps the three vectors unit and mutually orthogonal for any angles', () => {
    const o = orientationVectors(37, -20, 65);
    expect(vlen(o.bladeAxis)).toBeCloseTo(1, 9);
    expect(vlen(o.bladeNormal)).toBeCloseTo(1, 9);
    expect(vlen(o.transverse)).toBeCloseTo(1, 9);
    expect(vdot(o.bladeAxis, o.bladeNormal)).toBeCloseTo(0, 9);
    expect(vdot(o.bladeAxis, o.transverse)).toBeCloseTo(0, 9);
    expect(vdot(o.bladeNormal, o.transverse)).toBeCloseTo(0, 9);
  });
});
