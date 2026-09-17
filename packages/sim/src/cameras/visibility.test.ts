import { describe, expect, it } from 'vitest';
import { countIdPixels, idColor, idFromColor, visibilityFraction } from './visibility';

describe('visibilityFraction', () => {
  it('is the pixel count over the expected disc area π(r·pxPerCm)², clamped to [0, 1]', () => {
    const area = Math.PI * 24 * 24; // r = 3 cm, 8 px/cm
    expect(visibilityFraction(area / 2, 3, 8)).toBeCloseTo(0.5);
    expect(visibilityFraction(area * 3, 3, 8)).toBe(1);
    expect(visibilityFraction(0, 3, 8)).toBe(0);
    expect(visibilityFraction(10, 0, 8)).toBe(0);
  });
});

describe('idColor / idFromColor', () => {
  it('is bijective on 1..255 and inverts exactly; black means no tomato', () => {
    const seen = new Set<string>();
    for (let id = 1; id <= 255; id++) {
      const c = idColor(id);
      seen.add(c.join(','));
      expect(idFromColor(c)).toBe(id);
    }
    expect(seen.size).toBe(255);
    expect(idFromColor([0, 0, 0])).toBe(0);
  });
});

describe('countIdPixels', () => {
  it('counts RGBA pixels per id and ignores black', () => {
    const px = new Uint8ClampedArray([...idColor(3), 255, 0, 0, 0, 255, ...idColor(3), 255, ...idColor(7), 255]);
    const counts = countIdPixels(px);
    expect(counts.get(3)).toBe(2);
    expect(counts.get(7)).toBe(1);
    expect(counts.has(0)).toBe(false);
  });
});
