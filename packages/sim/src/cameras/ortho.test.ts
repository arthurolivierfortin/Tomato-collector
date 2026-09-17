import { describe, expect, it } from 'vitest';
import { createDefaultWorld, degToRad, vdot, vlen, vscale, type CameraPose, type Vec3 } from '@tomato/shared';
import {
  FOCUS_HEIGHT_CM, cameraBasis, gridPlanePoint, imageAxes, projectToPixel, pxPerCmOf, rotateAroundAxis, vcross,
} from './ortho';

const world = createDefaultWorld(1);
const front = world.cameras.front; // [0, -100, 45], champ 100 cm → 8 px/cm
const top = world.cameras.top; // [0, 0, 120]
const side = world.cameras.side; // [100, 0, 45]

function close(v: Vec3, expected: Vec3): void {
  for (let i = 0; i < 3; i++) expect(v[i]).toBeCloseTo(expected[i]!, 6);
}

describe('rotateAroundAxis', () => {
  it('rotates +X into +Y around +Z by 90° (right-hand rule)', () => {
    close(rotateAroundAxis([1, 0, 0], [0, 0, 1], 90), [0, 1, 0]);
  });

  it('leaves the axis itself unchanged', () => {
    close(rotateAroundAxis([0, 0, 1], [0, 0, 1], 37), [0, 0, 1]);
  });
});

describe('cameraBasis', () => {
  it('uses the nominal bases of the spec (top −Z, front +Y, side −X)', () => {
    const t = cameraBasis('top', top);
    close(t.forward, [0, 0, -1]); close(t.right, [1, 0, 0]); close(t.up, [0, 1, 0]);
    const f = cameraBasis('front', front);
    close(f.forward, [0, 1, 0]); close(f.right, [1, 0, 0]); close(f.up, [0, 0, 1]);
    const s = cameraBasis('side', side);
    close(s.forward, [-1, 0, 0]); close(s.right, [0, 1, 0]); close(s.up, [0, 0, 1]);
  });

  it('positive tilt makes the front camera look upward, right axis unchanged', () => {
    const b = cameraBasis('front', { ...front, tiltDeg: 10 });
    expect(b.forward[2]).toBeGreaterThan(0);
    expect(b.forward[1]).toBeCloseTo(Math.cos(degToRad(10)));
    close(b.right, [1, 0, 0]);
  });

  it('keeps an orthonormal basis with right × up = −forward after yaw and tilt', () => {
    const b = cameraBasis('side', { ...side, yawDeg: 20, tiltDeg: -15 });
    expect(vdot(b.forward, b.right)).toBeCloseTo(0);
    expect(vdot(b.forward, b.up)).toBeCloseTo(0);
    expect(vdot(b.right, b.up)).toBeCloseTo(0);
    expect(vlen(b.forward)).toBeCloseTo(1);
    expect(vlen(b.up)).toBeCloseTo(1);
    close(vcross(b.right, b.up), vscale(b.forward, -1));
  });
});

describe('projectToPixel', () => {
  it('front camera: a point 10 cm to the right of the axis lands at px = 400 + 10·pxPerCm', () => {
    expect(pxPerCmOf(front)).toBe(8);
    const [px, py] = projectToPixel('front', front, [10, 0, 45]);
    expect(px).toBeCloseTo(400 + 10 * 8);
    expect(py).toBeCloseTo(400);
  });

  it('a higher point lands at a smaller py (py grows downward)', () => {
    const low = projectToPixel('front', front, [0, 0, 40]);
    const high = projectToPixel('front', front, [0, 0, 60]);
    expect(high[1]).toBeLessThan(low[1]);
    expect(low[1] - high[1]).toBeCloseTo(20 * 8);
  });

  it('top camera maps world +X to the right and +Y upward', () => {
    const p = projectToPixel('top', top, [5, 10, 45]);
    expect(p[0]).toBeCloseTo(440);
    expect(p[1]).toBeCloseTo(320);
  });

  it('side camera maps world +Y to the right', () => {
    const p = projectToPixel('side', side, [0, 10, 45]);
    expect(p[0]).toBeCloseTo(480);
    expect(p[1]).toBeCloseTo(400);
  });

  it('yaw 90° on the front camera turns +X into depth (px stays 400)', () => {
    const yawed: CameraPose = { ...front, yawDeg: 90 };
    const p = projectToPixel('front', yawed, [10, -100, 45]);
    expect(p[0]).toBeCloseTo(400);
    expect(p[1]).toBeCloseTo(400);
    close(cameraBasis('front', yawed).forward, [-1, 0, 0]);
  });

  it('is independent of depth along the forward axis (orthographic)', () => {
    const near = projectToPixel('front', front, [10, -50, 45]);
    const far = projectToPixel('front', front, [10, 50, 45]);
    expect(near).toEqual(far);
  });
});

describe('imageAxes and gridPlanePoint', () => {
  it('follow the camera table of the spec', () => {
    expect(imageAxes('top')).toEqual({ horizontal: 'X', vertical: 'Y', horizontalSign: 1, verticalSign: 1 });
    expect(imageAxes('front')).toEqual({ horizontal: 'X', vertical: 'Z', horizontalSign: 1, verticalSign: 1 });
    expect(imageAxes('side')).toEqual({ horizontal: 'Y', vertical: 'Z', horizontalSign: 1, verticalSign: 1 });
  });

  it('puts the grid plane through the look-at point', () => {
    expect(gridPlanePoint('front', { ...front, positionCm: [12, -100, 45] })).toEqual([12, 0, 45]);
    expect(gridPlanePoint('side', { ...side, positionCm: [100, -7, 50] })).toEqual([0, -7, 50]);
    expect(gridPlanePoint('top', { ...top, positionCm: [3, 4, 120] })).toEqual([3, 4, FOCUS_HEIGHT_CM]);
  });
});
