import { describe, expect, it } from 'vitest';
import { RADIUS_GROWTH, RIPEN_DURATION_S, radiusScale, ripenessAt, stateFromRipeness } from './ripening';

describe('ripenessAt', () => {
  it('is 0 before the 15 s ramp, 1 at ripenAtS and clamped after', () => {
    expect(RIPEN_DURATION_S).toBe(15);
    expect(ripenessAt(40, 0)).toBe(0);
    expect(ripenessAt(40, 25)).toBe(0);
    expect(ripenessAt(40, 32.5)).toBeCloseTo(0.5);
    expect(ripenessAt(40, 40)).toBe(1);
    expect(ripenessAt(40, 100)).toBe(1);
  });

  it('is 1 immediately when ripenAtS equals the current time (ripen_next)', () => {
    expect(ripenessAt(12.3, 12.3)).toBe(1);
  });
});

describe('stateFromRipeness', () => {
  it('maps the thresholds of the contract', () => {
    expect(stateFromRipeness(0)).toBe('unripe');
    expect(stateFromRipeness(0.349)).toBe('unripe');
    expect(stateFromRipeness(0.35)).toBe('turning');
    expect(stateFromRipeness(0.899)).toBe('turning');
    expect(stateFromRipeness(0.9)).toBe('ripe');
    expect(stateFromRipeness(1)).toBe('ripe');
  });
});

describe('radiusScale', () => {
  it('grows the radius linearly from ×1.0 to ×1.3', () => {
    expect(RADIUS_GROWTH).toBe(0.3);
    expect(radiusScale(0)).toBe(1);
    expect(radiusScale(0.5)).toBeCloseTo(1.15);
    expect(radiusScale(1)).toBeCloseTo(1.3);
  });
});
