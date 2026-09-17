import { describe, expect, it } from 'vitest';
import { createDefaultWorld, degToRad } from '@tomato/shared';
import { gridSegments, scaleBar } from './gridLines';

const world = createDefaultWorld(1);
const front = world.cameras.front; // 8 px/cm
const top = world.cameras.top;

describe('gridSegments', () => {
  it('front camera: X lines are vertical in the image, at px = 400 + X·pxPerCm', () => {
    const segs = gridSegments('front', front, 10, 100);
    const xLines = segs.filter((s) => s.axis === 'X');
    expect(xLines.map((s) => s.valueCm)).toEqual(Array.from({ length: 21 }, (_, i) => -100 + i * 10));
    const x0 = xLines.find((s) => s.valueCm === 0)!;
    expect(x0.fromPx[0]).toBeCloseTo(400);
    expect(x0.toPx[0]).toBeCloseTo(400);
    expect(Math.abs(x0.toPx[1] - x0.fromPx[1])).toBeCloseTo(200 * 8);
    const x10 = xLines.find((s) => s.valueCm === 10)!;
    expect(x10.fromPx[0]).toBeCloseTo(480);
  });

  it('front camera: Z lines are horizontal, at py = 400 − (Z − 45)·pxPerCm', () => {
    const segs = gridSegments('front', front, 10, 100);
    const z50 = segs.find((s) => s.axis === 'Z' && s.valueCm === 50)!;
    expect(z50.fromPx[1]).toBeCloseTo(360);
    expect(z50.toPx[1]).toBeCloseTo(360);
    expect(segs.filter((s) => s.axis === 'Z').map((s) => s.valueCm)).toEqual(
      Array.from({ length: 20 }, (_, i) => -50 + i * 10),
    );
  });

  it('stays world-aligned when the camera tilts: Z lines stay horizontal, X lines foreshorten', () => {
    const segs = gridSegments('front', { ...front, tiltDeg: 20 }, 10, 100);
    const z40 = segs.find((s) => s.axis === 'Z' && s.valueCm === 40)!;
    expect(z40.fromPx[1]).toBeCloseTo(z40.toPx[1]);
    const x0 = segs.find((s) => s.axis === 'X' && s.valueCm === 0)!;
    expect(Math.abs(x0.toPx[1] - x0.fromPx[1])).toBeCloseTo(200 * 8 * Math.cos(degToRad(20)));
  });

  it('top camera: lines lie in the plane z = 45 and Y = 0 passes through py = 400', () => {
    const segs = gridSegments('top', top, 10, 50);
    const y0 = segs.find((s) => s.axis === 'Y' && s.valueCm === 0)!;
    expect(y0.fromPx[1]).toBeCloseTo(400);
    expect(y0.toPx[1]).toBeCloseTo(400);
    expect(segs.every((s) => s.axis === 'X' || s.axis === 'Y')).toBe(true);
  });
});

describe('scaleBar', () => {
  it('picks the longest of 20, 10, 5 cm that fits in 200 px', () => {
    expect(scaleBar(8)).toEqual({ lengthPx: 160, labelCm: 20 });
    expect(scaleBar(16)).toEqual({ lengthPx: 160, labelCm: 10 });
    expect(scaleBar(40)).toEqual({ lengthPx: 200, labelCm: 5 });
    expect(scaleBar(4)).toEqual({ lengthPx: 80, labelCm: 20 });
    expect(scaleBar(80)).toEqual({ lengthPx: 400, labelCm: 5 });
  });
});
