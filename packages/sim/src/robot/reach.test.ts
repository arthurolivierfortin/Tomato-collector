import { describe, expect, it } from 'vitest';
import { DEFAULT_LIMITS } from '@tomato/shared';
import { MIN_Z_CM, distanceFromBase, isReachable } from './reach';

describe('isReachable', () => {
  const base = DEFAULT_LIMITS.scissorsBaseCm; // [60, -30, 0]
  const reach = DEFAULT_LIMITS.scissorsReachCm; // 110

  it('accepts points within the reach sphere above the floor', () => {
    expect(isReachable(base, reach, [0, 0, 60])).toBe(true);
    expect(distanceFromBase(base, [0, 0, 60])).toBeCloseTo(Math.sqrt(3600 + 900 + 3600), 9);
    expect(isReachable(base, reach, [130, 40, 5])).toBe(true);
  });

  it('refuses points beyond the reach', () => {
    expect(isReachable(base, reach, [-30, 30, 60])).toBe(false);
    expect(isReachable(base, reach, [60, -30, 111])).toBe(false);
  });

  it('refuses points below MIN_Z_CM even when close to the base', () => {
    expect(MIN_Z_CM).toBe(5);
    expect(isReachable(base, reach, [40, -30, 2])).toBe(false);
    expect(isReachable(base, reach, [40, -30, 5])).toBe(true);
  });
});
