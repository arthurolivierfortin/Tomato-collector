import { describe, expect, it } from 'vitest';
import { composeRgba, darkenRgba, grayscale, sobelMagnitude, thresholdToWhite } from './edgesCore';

/** Image 4×4 : deux colonnes noires puis deux colonnes blanches. */
function stepImage(): Uint8ClampedArray {
  const rgba = new Uint8ClampedArray(4 * 4 * 4);
  for (let y = 0; y < 4; y++) {
    for (let x = 0; x < 4; x++) {
      const v = x >= 2 ? 255 : 0;
      rgba.set([v, v, v, 255], (y * 4 + x) * 4);
    }
  }
  return rgba;
}

describe('edgesCore', () => {
  it('grayscale weights RGB with the Rec. 601 coefficients', () => {
    const g = grayscale(new Uint8ClampedArray([255, 0, 0, 255, 0, 255, 0, 255]), 2);
    expect(g[0]).toBeCloseTo(76.245);
    expect(g[1]).toBeCloseTo(149.685);
  });

  it('sobelMagnitude is strong on the step and zero away from it and on the border', () => {
    const mag = sobelMagnitude(grayscale(stepImage(), 16), 4, 4);
    expect(mag[1 * 4 + 1]).toBeCloseTo(1020); // |gx| = 255 + 2·255 + 255
    expect(mag[1 * 4 + 2]).toBeCloseTo(1020);
    expect(mag[0]).toBe(0);
    expect(mag[3 * 4 + 3]).toBe(0);
  });

  it('thresholdToWhite writes opaque white where the magnitude reaches the threshold, transparent elsewhere', () => {
    const out = thresholdToWhite(new Float32Array([0, 120, 500]), 120);
    expect(Array.from(out)).toEqual([0, 0, 0, 0, 255, 255, 255, 255, 255, 255, 255, 255]);
  });

  it('darkenRgba scales RGB and forces alpha to 255', () => {
    expect(Array.from(darkenRgba(new Uint8ClampedArray([200, 100, 50, 10]), 0.5))).toEqual([100, 50, 25, 255]);
  });

  it('composeRgba puts opaque overlay pixels over the base and keeps the base under transparent ones', () => {
    const base = new Uint8ClampedArray([10, 20, 30, 255, 40, 50, 60, 255]);
    const over = new Uint8ClampedArray([255, 255, 255, 255, 0, 0, 0, 0]);
    expect(Array.from(composeRgba(base, over))).toEqual([255, 255, 255, 255, 40, 50, 60, 255]);
  });
});
