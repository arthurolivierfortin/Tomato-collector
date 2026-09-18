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

describe('forme fermée de la normale des lames (prompts/system.md)', () => {
  const closedForm = (yawDeg: number, pitchDeg: number): Vec3 => {
    const y = (yawDeg * Math.PI) / 180;
    const p = (pitchDeg * Math.PI) / 180;
    return [Math.sin(p) * Math.cos(y), Math.sin(p) * Math.sin(y), Math.cos(p)];
  };

  it('bladeNormal = (sin p·cos y, sin p·sin y, cos p) at roll 0, for any yaw and pitch', () => {
    for (const yaw of [-180, -121.8, -53.6, -27.9, 0, 39.9, 90, 152.1]) {
      for (const pitch of [-90, -49.5, -39.5, 0, 13.6, 42.6, 58.5, 90]) {
        expectVec(orientationVectors(yaw, pitch, 0).bladeNormal, closedForm(yaw, pitch));
      }
    }
  });

  it('the poses (yaw, pitch) and (yaw ∓ 180, −pitch) give the same blade plane, blades opposed', () => {
    const a = orientationVectors(152.1, 39.6, 0);
    const b = orientationVectors(-27.9, -39.6, 0);
    expectVec(b.bladeNormal, a.bladeNormal);
    // Seule la seconde garde les lames tournées vers le plant (base du bras en +X).
    expect(a.bladeAxis[0]).toBeGreaterThan(0);
    expect(b.bladeAxis[0]).toBeLessThan(0);
  });

  it('keeps the blades towards the plant on a stem of the -X -Y quadrant (yaw + 180 branch)', () => {
    // Tige d = (1, 1, -1) : lacet brut -135°, donc la pose retenue est (45, -54,7356).
    const d: Vec3 = [1, 1, -1];
    const chosen = orientationVectors(45, -54.7356, 0);
    const rejected = orientationVectors(-135, 54.7356, 0);
    expect(Math.abs(vdot(chosen.bladeNormal, d)) / vlen(d)).toBeCloseTo(1, 5);
    expect(Math.abs(vdot(rejected.bladeNormal, d)) / vlen(d)).toBeCloseTo(1, 5);
    expectVec(rejected.bladeNormal, chosen.bladeNormal);
    // Même plan de lames, mais seule la pose retenue pointe de la base du bras (+X) vers le plant.
    expect(chosen.bladeAxis[0]).toBeLessThan(0);
    expect(rejected.bladeAxis[0]).toBeGreaterThan(0);
  });

  it('lays the normal on the real stems of 2026-09-18, within the 45° cut rule', () => {
    const stems: { d: Vec3; yaw: number; pitch: number }[] = [
      { d: [-0.563, 0.298, 0.771], yaw: -27.9, pitch: -39.6 },
      { d: [0.655, 0.546, 0.523], yaw: 39.8, pitch: 58.5 },
      { d: [-0.451, 0.612, 0.65], yaw: -53.6, pitch: -49.5 },
    ];
    for (const s of stems) {
      const n = orientationVectors(s.yaw, s.pitch, 0).bladeNormal;
      expect(Math.abs(vdot(n, s.d)) / vlen(s.d)).toBeCloseTo(1, 3);
    }
  });
});
