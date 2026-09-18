import { describe, expect, it } from 'vitest';
import { makeRgba, resizeRgba, rgbToHsv } from './rgba';

describe('rgbToHsv (échelle OpenCV : H 0..180, S et V 0..255)', () => {
  it('maps pure red, green and blue to hues 0, 60 and 120 with full saturation', () => {
    expect(rgbToHsv(255, 0, 0)).toEqual([0, 255, 255]);
    expect(rgbToHsv(0, 255, 0)).toEqual([60, 255, 255]);
    expect(rgbToHsv(0, 0, 255)).toEqual([120, 255, 255]);
  });

  it('gives grey a zero saturation and black a zero value', () => {
    expect(rgbToHsv(90, 90, 90)).toEqual([0, 0, 90]);
    expect(rgbToHsv(0, 0, 0)).toEqual([0, 0, 0]);
  });

  it('puts the ripe red #c8261b in the low red band and the unripe green far from it', () => {
    const [h, s, v] = rgbToHsv(200, 38, 27);
    expect(h).toBeLessThan(10);
    expect(s).toBeGreaterThan(100);
    expect(v).toBe(200);
    const [hg] = rgbToHsv(63, 154, 58);
    expect(hg).toBeGreaterThan(50);
    expect(hg).toBeLessThan(70);
  });

  it('wraps magenta-ish reds to the high band (H > 170)', () => {
    const [h] = rgbToHsv(255, 0, 40);
    expect(h).toBeGreaterThan(170);
  });
});

describe('resizeRgba', () => {
  it('keeps a uniform image uniform and opaque', () => {
    const out = resizeRgba(makeRgba(8, 8, [10, 20, 30]), 3, 5);
    expect(out.width).toBe(3);
    expect(out.height).toBe(5);
    for (let i = 0; i < 15; i++) expect(Array.from(out.data.subarray(i * 4, i * 4 + 4))).toEqual([10, 20, 30, 255]);
  });

  it('downsamples 800 → 640 with the expected buffer size and averages a hard edge', () => {
    const img = makeRgba(800, 800, [0, 0, 0]);
    for (let y = 0; y < 800; y++) for (let x = 400; x < 800; x++) img.data.set([255, 255, 255, 255], (y * 800 + x) * 4);
    const out = resizeRgba(img, 640, 640);
    expect(out.data.length).toBe(640 * 640 * 4);
    expect(out.data[(10 * 640 + 10) * 4]).toBe(0);
    expect(out.data[(10 * 640 + 630) * 4]).toBe(255);
  });

  it('returns the same object when the size already matches', () => {
    const img = makeRgba(4, 4);
    expect(resizeRgba(img, 4, 4)).toBe(img);
  });
});
