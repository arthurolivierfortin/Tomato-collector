import { describe, expect, it } from 'vitest';
import { CLASS_NAMES, SEED_STRIDE, parseArgs, pickCamera, plan, plantSeed, toYoloLines } from './datasetPlan';
import type { SampleLabel } from './pageGlobals';

describe('parseArgs', () => {
  it('falls back to a 100-image run on port 5319', () => {
    expect(parseArgs([])).toEqual({ count: 100, port: 5319, seed: 36, out: 'data/perception/eval', camera: 'front' });
  });

  it('reads the flags and ignores the ones that are not numbers', () => {
    expect(parseArgs(['--count', '12', '--port', '5173', '--seed', '7', '--out', 'tmp/set', '--camera', 'all'])).toEqual({ count: 12, port: 5173, seed: 7, out: 'tmp/set', camera: 'all' });
    expect(parseArgs(['--count', 'abc']).count).toBe(100);
  });
});

describe('plan', () => {
  it('is deterministic for a seed and varies the ripening', () => {
    const a = plan(30, 36);
    expect(a).toEqual(plan(30, 36));
    expect(a).toHaveLength(30);
    expect(new Set(a.map((s) => s.ripenCount)).size).toBeGreaterThan(2);
    expect(a.every((s) => s.ripenCount >= 0 && s.ripenCount <= 4)).toBe(true);
    expect(a.every((s) => s.settleMs >= 200 && s.settleMs < 700)).toBe(true);
    expect(plan(30, 37)).not.toEqual(a);
  });

  // Le point qui rend un jeu de contrôle honnête : deux jeux ne doivent jamais voir le même plant.
  it('gives every shot its own plant seed, in a range reserved for its dataset', () => {
    const train = plan(400, 2607).map((s) => s.plantSeed);
    const evaluation = plan(100, 36).map((s) => s.plantSeed);
    const holdout = plan(60, 999).map((s) => s.plantSeed);
    expect(new Set([...train, ...evaluation, ...holdout]).size).toBe(560);
    expect(new Set(train).size).toBe(400);
    expect(plantSeed(36, 0)).toBe(36 * SEED_STRIDE + 1);
    // Aucune graine n'est 0 : `new_plant` sans graine enchaînerait la suite par défaut de la page.
    expect(plan(10, 0).every((s) => s.plantSeed > 0)).toBe(true);
  });

  it('cycles through the three cameras', () => {
    expect([0, 1, 2, 3].map((i) => pickCamera(i, 'all'))).toEqual(['front', 'top', 'side', 'front']);
    expect([0, 1, 2].map((i) => pickCamera(i, 'front'))).toEqual(['front', 'front', 'front']);
    expect(pickCamera(1)).toBe('top');
  });
});

describe('toYoloLines', () => {
  const labels: SampleLabel[] = [
    { tomatoId: 1, label: 'ripe', bbox: [100, 200, 40, 40] },
    { tomatoId: 2, label: 'unripe', bbox: [0, 0, 800, 400] },
  ];

  it('normalises each box to centre/size and uses the exported class order', () => {
    expect(CLASS_NAMES).toEqual(['unripe', 'ripe']);
    expect(toYoloLines(labels, 800, 800)).toBe('1 0.150000 0.275000 0.050000 0.050000\n0 0.500000 0.250000 1.000000 0.500000\n');
  });

  it('writes an empty file for an image without fruit', () => {
    expect(toYoloLines([], 800, 800)).toBe('');
  });
});
