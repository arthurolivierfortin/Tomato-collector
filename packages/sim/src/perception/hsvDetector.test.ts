import { describe, expect, it } from 'vitest';
import { hsvDetector, redMask } from './hsvDetector';
import { RIPE_RGB, TURNING_RGB, UNRIPE_RGB, discImage } from './testImages';

describe('redMask', () => {
  it('selects the ripe red, rejects the unripe green, the turning orange and the background', () => {
    const img = discImage(8, 1, [
      { cx: 1, cy: 0, r: 0.5, rgb: RIPE_RGB },
      { cx: 3, cy: 0, r: 0.5, rgb: UNRIPE_RGB },
      { cx: 5, cy: 0, r: 0.5, rgb: TURNING_RGB },
    ]);
    expect(Array.from(redMask(img))).toEqual([0, 1, 0, 0, 0, 0, 0, 0]);
  });

  it('rejects a dark red shadow (V ≤ 80) and a washed-out pink (S ≤ 100)', () => {
    const img = discImage(2, 1, [
      { cx: 0, cy: 0, r: 0.5, rgb: [70, 10, 8] },
      { cx: 1, cy: 0, r: 0.5, rgb: [230, 170, 170] },
    ]);
    expect(Array.from(redMask(img))).toEqual([0, 0]);
  });
});

describe('hsvDetector', () => {
  const img = discImage(64, 64, [
    { cx: 20, cy: 30, r: 10, rgb: RIPE_RGB },
    { cx: 46, cy: 18, r: 8, rgb: UNRIPE_RGB },
    { cx: 5, cy: 5, r: 0.5, rgb: RIPE_RGB },
    { cx: 60, cy: 60, r: 1, rgb: RIPE_RGB },
  ]);

  it('returns one ripe detection around the red disc, with a disc-like fill ratio', async () => {
    const dets = await hsvDetector(img);
    expect(dets).toHaveLength(1);
    const d = dets[0]!;
    expect(d.label).toBe('ripe');
    expect(d.bbox[0]).toBeGreaterThanOrEqual(9);
    expect(d.bbox[0]).toBeLessThanOrEqual(11);
    expect(d.bbox[1]).toBeGreaterThanOrEqual(19);
    expect(d.bbox[1]).toBeLessThanOrEqual(21);
    expect(d.bbox[2]).toBeGreaterThanOrEqual(19);
    expect(d.bbox[2]).toBeLessThanOrEqual(22);
    expect(d.score).toBeGreaterThan(0.7);
    expect(d.score).toBeLessThan(0.9);
  });

  it('ignores an image without red', async () => {
    expect(await hsvDetector(discImage(32, 32, [{ cx: 16, cy: 16, r: 8, rgb: UNRIPE_RGB }]))).toEqual([]);
  });

  it('sorts several blobs by decreasing area', async () => {
    const two = discImage(96, 48, [
      { cx: 20, cy: 24, r: 6, rgb: RIPE_RGB },
      { cx: 70, cy: 24, r: 12, rgb: RIPE_RGB },
    ]);
    const dets = await hsvDetector(two);
    expect(dets).toHaveLength(2);
    expect(dets[0]!.bbox[2]).toBeGreaterThan(dets[1]!.bbox[2]);
  });
});
