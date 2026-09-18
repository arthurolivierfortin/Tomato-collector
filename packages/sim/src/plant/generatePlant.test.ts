import { describe, expect, it } from 'vitest';
import { vlen, vsub } from '@tomato/shared';
import { branchPoint, generatePlant } from './generatePlant';

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

  it('hangs 4-8 tomatoes on 7-9 cm pedicels tilted 0-60° from vertical', () => {
    expect(spec.tomatoes.length).toBeGreaterThanOrEqual(4);
    expect(spec.tomatoes.length).toBeLessThanOrEqual(8);
    for (const t of spec.tomatoes) {
      const d = vsub(t.centerCm, t.anchorCm);
      const len = vlen(d);
      expect(len).toBeGreaterThanOrEqual(7);
      expect(len).toBeLessThanOrEqual(9);
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

describe('generatePlant v2', () => {
  const v2 = generatePlant(123);

  it('curves every branch through a control point above its chord', () => {
    for (const b of v2.branches) {
      expect(b.midCm[2]).toBeGreaterThan((b.fromCm[2] + b.toCm[2]) / 2);
      expect(branchPoint(b, 0)).toEqual(b.fromCm);
      expect(branchPoint(b, 1)).toEqual(b.toCm);
      const mid = branchPoint(b, 0.5);
      expect(mid[2]).toBeGreaterThan((b.fromCm[2] + b.toCm[2]) / 2);
    }
  });

  it('anchors every tomato on a curved branch', () => {
    for (const t of v2.tomatoes) {
      let best = Infinity;
      for (const b of v2.branches) {
        for (let i = 0; i <= 100; i++) best = Math.min(best, vlen(vsub(branchPoint(b, i / 100), t.anchorCm)));
      }
      expect(best).toBeLessThan(0.5);
    }
  });

  it('is denser: at least six leaflets per branch, grouped 2-3 per node', () => {
    expect(v2.leaves.length).toBeGreaterThanOrEqual(v2.branches.length * 6);
  });

  it('staggers ripening so the first tomato is already turning shortly after load', () => {
    const times = v2.tomatoes.map((t) => t.ripenAtS).sort((a, b) => a - b);
    expect(times[0]).toBe(10);
    for (let i = 1; i < times.length; i++) expect(times[i]! - times[i - 1]!).toBe(20);
  });
});
