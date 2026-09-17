import { describe, expect, it } from 'vitest';
import { MAX_GRID_LINES, chooseSpacing } from './gridSpacing';

describe('chooseSpacing', () => {
  it('picks 10 cm at 8 px/cm, 5 cm at 16, 20 cm at 4, 2 cm at 40 and 1 cm at 80', () => {
    expect(chooseSpacing(8)).toBe(10);
    expect(chooseSpacing(16)).toBe(5);
    expect(chooseSpacing(4)).toBe(20);
    expect(chooseSpacing(40)).toBe(2);
    expect(chooseSpacing(80)).toBe(1);
  });

  it('never exceeds 16 lines and keeps at least 6 across the usual zoom range', () => {
    // 8 à 16 lignes sauf juste au-dessus du passage 2 → 5 cm, où le minimum tombe à 6,4 (spec : 8 à 16, espacements imposés).
    for (let k = 4; k <= 40; k += 0.5) {
      const lines = 800 / k / chooseSpacing(k);
      expect(lines).toBeLessThanOrEqual(MAX_GRID_LINES);
      expect(lines).toBeGreaterThanOrEqual(6);
    }
  });

  it('honours a different image size', () => {
    expect(chooseSpacing(8, 400)).toBe(5);
  });
});
