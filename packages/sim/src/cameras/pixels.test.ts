import { describe, expect, it } from 'vitest';
import { LINEAR_TO_SRGB_LUT, applyLutRgb, flipRowsRgba } from './pixels';

describe('flipRowsRgba', () => {
  it('reverses the row order of a bottom-up RGBA buffer', () => {
    const src = new Uint8Array([1, 1, 1, 1, 2, 2, 2, 2, 3, 3, 3, 3, 4, 4, 4, 4]); // 2×2 : ligne 0 = px1 px2, ligne 1 = px3 px4
    expect(Array.from(flipRowsRgba(src, 2, 2))).toEqual([3, 3, 3, 3, 4, 4, 4, 4, 1, 1, 1, 1, 2, 2, 2, 2]);
  });
});

describe('LINEAR_TO_SRGB_LUT', () => {
  it('keeps black and white and brightens mid-tones', () => {
    expect(LINEAR_TO_SRGB_LUT.length).toBe(256);
    expect(LINEAR_TO_SRGB_LUT[0]).toBe(0);
    expect(LINEAR_TO_SRGB_LUT[255]).toBe(255);
    expect(LINEAR_TO_SRGB_LUT[55]).toBeGreaterThanOrEqual(126); // linéaire 0,216 → sRGB ≈ 0,5
    expect(LINEAR_TO_SRGB_LUT[55]).toBeLessThanOrEqual(130);
  });

  it('applyLutRgb converts RGB in place and leaves alpha untouched', () => {
    const data = new Uint8ClampedArray([55, 0, 255, 77]);
    applyLutRgb(data, LINEAR_TO_SRGB_LUT);
    expect(data[0]).toBe(LINEAR_TO_SRGB_LUT[55]);
    expect(data[1]).toBe(0);
    expect(data[2]).toBe(255);
    expect(data[3]).toBe(77);
  });
});
