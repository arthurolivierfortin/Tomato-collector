import { describe, expect, it } from 'vitest';
import { vlen, vsub } from '@tomato/shared';
import { generatePlant, type PlantSpec } from './generatePlant';
import { ripenTomato, stemOf, tomatoesFromSpec } from './plantState';

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

  it('is ripe with radius ×1.2 once past ripenAtS', () => {
    const t1 = tomatoesFromSpec(spec, 20)[0]!;
    expect(t1.state).toBe('ripe');
    expect(t1.ripeness).toBe(1);
    expect(t1.radiusCm).toBeCloseTo(3.6);
    // Le point d'attache suit la surface du fruit grossi : 5 cm de pédoncule − 3,6 cm de rayon.
    expect(t1.stem.toCm).toEqual([10, 0, 48.6]);
  });
});

describe('ripenTomato', () => {
  it('updates ripeness, state and radius and preserves the other fields', () => {
    const before = { ...tomatoesFromSpec(spec, 0)[0]!, visibleIn: { top: 0.42, front: 1, side: 0 }, positionCm: [1, 2, 3] as const };
    const after = ripenTomato(before, spec.tomatoes[0]!, 20, 12.5);
    expect(after.ripeness).toBeCloseTo(0.5);
    expect(after.state).toBe('turning');
    expect(after.radiusCm).toBeCloseTo(3.3);
    expect(after.stem.toCm[2]).toBeCloseTo(48.3);
    expect(after.stem.fromCm).toEqual([10, 0, 50]);
    expect(after.visibleIn).toEqual({ top: 0.42, front: 1, side: 0 });
    expect(after.positionCm).toEqual([1, 2, 3]);
    expect(after.attached).toBe(true);
  });
});

describe('pedicel of a fully ripe tomato', () => {
  it('keeps its attachment point on the grown surface and stays graspable on seeds 1..20', () => {
    for (let seed = 1; seed <= 20; seed++) {
      const plant = generatePlant(seed);
      const ripe = tomatoesFromSpec(plant, 0).map((t, i) =>
        ripenTomato(t, plant.tomatoes[i]!, 0, 0),
      );
      for (const t of ripe) {
        expect(t.ripeness).toBe(1);
        // Le point d'attache est sur la surface du fruit MÛRI, pas sur son rayon de génération.
        expect(vlen(vsub(t.stem.toCm, t.positionCm))).toBeCloseTo(t.radiusCm);
        // Ce qui reste de pédoncule visible doit rester saisissable par les ciseaux (marge de collision 0,5 cm).
        expect(vlen(vsub(t.stem.toCm, t.stem.fromCm))).toBeGreaterThanOrEqual(2.5);
      }
    }
  });
});
