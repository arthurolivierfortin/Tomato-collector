import { describe, expect, it } from 'vitest';
import type { PlantSpec } from './generatePlant';
import { nextToRipen, ripenTomato, stemOf, tomatoesFromSpec } from './plantState';

const spec: PlantSpec = {
  seed: 1,
  mainStem: [[0, 0, 0], [0, 0, 70]],
  stemRadiusCm: 1.1,
  branches: [],
  leaves: [],
  tomatoes: [
    { id: 1, anchorCm: [10, 0, 50], centerCm: [10, 0, 45], radiusCm: 3, ripenAtS: 20 },
    { id: 2, anchorCm: [-10, 5, 40], centerCm: [-13, 5, 36], radiusCm: 2.5, ripenAtS: 40 },
  ],
};

describe('stemOf', () => {
  it('goes from the anchor to the surface of the fruit along the pedicel direction', () => {
    expect(stemOf(spec.tomatoes[0]!)).toEqual({ fromCm: [10, 0, 50], toCm: [10, 0, 48] });
    const s = stemOf(spec.tomatoes[1]!);
    expect(s.fromCm).toEqual([-10, 5, 40]);
    expect(s.toCm[0]).toBeCloseTo(-11.5);
    expect(s.toCm[1]).toBeCloseTo(5);
    expect(s.toCm[2]).toBeCloseTo(38);
  });
});

describe('tomatoesFromSpec', () => {
  it('fills every store field of the contract at t = 0', () => {
    const ts = tomatoesFromSpec(spec, 0);
    expect(ts.map((t) => t.id)).toEqual([1, 2]);
    const t1 = ts[0]!;
    expect(t1.positionCm).toEqual([10, 0, 45]);
    expect(t1.radiusCm).toBe(3);
    expect(t1.ripeness).toBe(0);
    expect(t1.state).toBe('unripe');
    expect(t1.attached).toBe(true);
    expect(t1.stem).toEqual({ fromCm: [10, 0, 50], toCm: [10, 0, 48] });
    expect(t1.visibleIn).toEqual({ top: 1, front: 1, side: 1 });
  });

  it('is ripe with radius ×1.3 once past ripenAtS', () => {
    const t1 = tomatoesFromSpec(spec, 20)[0]!;
    expect(t1.state).toBe('ripe');
    expect(t1.ripeness).toBe(1);
    expect(t1.radiusCm).toBeCloseTo(3.9);
  });
});

describe('ripenTomato', () => {
  it('updates ripeness, state and radius and preserves the other fields', () => {
    const before = { ...tomatoesFromSpec(spec, 0)[0]!, visibleIn: { top: 0.42, front: 1, side: 0 }, positionCm: [1, 2, 3] as const };
    const after = ripenTomato(before, spec.tomatoes[0]!, 20, 12.5);
    expect(after.ripeness).toBeCloseTo(0.5);
    expect(after.state).toBe('turning');
    expect(after.radiusCm).toBeCloseTo(3.45);
    expect(after.visibleIn).toEqual({ top: 0.42, front: 1, side: 0 });
    expect(after.positionCm).toEqual([1, 2, 3]);
    expect(after.attached).toBe(true);
  });
});

describe('nextToRipen', () => {
  const ripenAt = new Map([[1, 20], [2, 40]]);

  it('picks the attached unripe tomato with the earliest ripenAtS', () => {
    expect(nextToRipen(tomatoesFromSpec(spec, 0), ripenAt)).toBe(1);
  });

  it('skips ripe and detached tomatoes, null when none is left', () => {
    const ts = tomatoesFromSpec(spec, 20);
    expect(nextToRipen(ts, ripenAt)).toBe(2);
    const detached = ts.map((t) => (t.id === 2 ? { ...t, attached: false } : t));
    expect(nextToRipen(detached, ripenAt)).toBeNull();
  });
});
