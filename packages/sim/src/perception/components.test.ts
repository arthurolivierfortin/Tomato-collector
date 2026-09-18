import { describe, expect, it } from 'vitest';
import { labelComponents } from './components';
import { dilate3, erode3, open3 } from './morphology';

/** Masque 8×6 : un carré 3×3 en (1..3, 1..3), un pixel isolé en (6, 1), un rectangle 2×1 en (5..6, 4). */
function sample(): Uint8Array {
  const m = new Uint8Array(8 * 6);
  for (let y = 1; y <= 3; y++) for (let x = 1; x <= 3; x++) m[y * 8 + x] = 1;
  m[1 * 8 + 6] = 1;
  m[4 * 8 + 5] = 1;
  m[4 * 8 + 6] = 1;
  return m;
}

describe('morphology 3×3', () => {
  it('erode3 keeps only the centre of a 3×3 square and removes isolated pixels', () => {
    const e = erode3(sample(), 8, 6);
    expect(Array.from(e).reduce((a, b) => a + b, 0)).toBe(1);
    expect(e[2 * 8 + 2]).toBe(1);
  });

  it('dilate3 grows a single pixel into a 3×3 square, clipped by the border', () => {
    const m = new Uint8Array(4 * 4);
    m[0] = 1;
    const d = dilate3(m, 4, 4);
    expect(Array.from(d)).toEqual([1, 1, 0, 0, 1, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]);
  });

  it('open3 restores the 3×3 square and drops the noise', () => {
    const o = open3(sample(), 8, 6);
    expect(Array.from(o).reduce((a, b) => a + b, 0)).toBe(9);
    expect(o[1 * 8 + 6]).toBe(0);
    expect(o[4 * 8 + 5]).toBe(0);
  });
});

describe('labelComponents', () => {
  it('finds the three 4-connected components with their boxes and areas, in scan order', () => {
    const comps = labelComponents(sample(), 8, 6);
    expect(comps).toEqual([
      { minX: 1, minY: 1, maxX: 3, maxY: 3, area: 9 },
      { minX: 6, minY: 1, maxX: 6, maxY: 1, area: 1 },
      { minX: 5, minY: 4, maxX: 6, maxY: 4, area: 2 },
    ]);
  });

  it('does not join diagonal neighbours', () => {
    const m = new Uint8Array([1, 0, 0, 1]);
    expect(labelComponents(m, 2, 2)).toHaveLength(2);
  });

  it('handles a fully set image as one component without recursion', () => {
    const m = new Uint8Array(200 * 200).fill(1);
    const comps = labelComponents(m, 200, 200);
    expect(comps).toHaveLength(1);
    expect(comps[0]?.area).toBe(40000);
  });
});
