import { describe, expect, it } from 'vitest';
import { vlen, vsub } from '@tomato/shared';
import { generatePlant } from './generatePlant';

describe('generatePlant', () => {
  const spec = generatePlant(123);

  it('is deterministic for a seed', () => {
    expect(generatePlant(123)).toEqual(spec);
    expect(generatePlant(124)).not.toEqual(spec);
  });

  it('builds a main stem from the ground to 60-80 cm with 3-5 branches', () => {
    expect(spec.mainStem[0]).toEqual([0, 0, 0]);
    const top = spec.mainStem[spec.mainStem.length - 1]!;
    expect(top[2]).toBeGreaterThanOrEqual(60);
    expect(top[2]).toBeLessThanOrEqual(80);
    expect(spec.branches.length).toBeGreaterThanOrEqual(3);
    expect(spec.branches.length).toBeLessThanOrEqual(5);
  });

  it('hangs 4-8 tomatoes on short pedicels tilted 0-60° from vertical', () => {
    expect(spec.tomatoes.length).toBeGreaterThanOrEqual(4);
    expect(spec.tomatoes.length).toBeLessThanOrEqual(8);
    for (const t of spec.tomatoes) {
      const d = vsub(t.centerCm, t.anchorCm);
      const len = vlen(d);
      expect(len).toBeGreaterThanOrEqual(4);
      expect(len).toBeLessThanOrEqual(6);
      const tiltDeg = (Math.acos(-d[2] / len) * 180) / Math.PI;
      expect(tiltDeg).toBeGreaterThanOrEqual(0);
      expect(tiltDeg).toBeLessThanOrEqual(60.001);
      expect(t.radiusCm).toBeGreaterThanOrEqual(2.5);
      expect(t.radiusCm).toBeLessThanOrEqual(3.5);
      expect(t.ripenAtS).toBeGreaterThan(0);
    }
    const ids = spec.tomatoes.map((t) => t.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('places leaves along the branches', () => {
    expect(spec.leaves.length).toBeGreaterThanOrEqual(spec.branches.length * 2);
    for (const leaf of spec.leaves) {
      expect(leaf.sizeCm).toBeGreaterThanOrEqual(8);
      expect(leaf.sizeCm).toBeLessThanOrEqual(14);
    }
  });
});
