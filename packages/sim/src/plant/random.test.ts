import { describe, expect, it } from 'vitest';
import { createRng } from './random';

describe('createRng', () => {
  it('is deterministic for a seed and in [0, 1)', () => {
    const a = createRng(7);
    const b = createRng(7);
    const xs = Array.from({ length: 5 }, () => a());
    expect(xs).toEqual(Array.from({ length: 5 }, () => b()));
    for (const x of xs) {
      expect(x).toBeGreaterThanOrEqual(0);
      expect(x).toBeLessThan(1);
    }
  });

  it('differs between seeds', () => {
    expect(createRng(1)()).not.toBe(createRng(2)());
  });
});
