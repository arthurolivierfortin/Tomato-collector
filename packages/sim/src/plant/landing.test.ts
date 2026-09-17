import { describe, expect, it } from 'vitest';
import type { BasketPose } from '@tomato/shared';
import { LANDING_TIMEOUT_S, REST_SPEED_CM_S, landingOutcome, shouldDecide } from './landing';

const basket: BasketPose = { centerCm: [10, -5, 5], sizeCm: [20, 20], depthCm: 10 };

describe('landingOutcome', () => {
  it('is in_basket when XY is inside the rectangle and Z between the floor and floor + depth + radius', () => {
    expect(landingOutcome([10, -5, 8], 3, basket)).toBe('in_basket');
    expect(landingOutcome([19.9, 4.9, 5], 3, basket)).toBe('in_basket');
    expect(landingOutcome([0.1, -14.9, 18], 3, basket)).toBe('in_basket');
  });

  it('is airborne above the basket or below its floor', () => {
    expect(landingOutcome([10, -5, 18.1], 3, basket)).toBe('airborne');
    expect(landingOutcome([10, -5, 4.9], 3, basket)).toBe('airborne');
  });

  it('is floor when Z <= radius + 0.5 outside the basket', () => {
    expect(landingOutcome([40, 0, 3], 3, basket)).toBe('floor');
    expect(landingOutcome([40, 0, 3.5], 3, basket)).toBe('floor');
    expect(landingOutcome([-30, 30, 3.51], 3, basket)).toBe('airborne');
  });

  it('is airborne while falling outside the basket', () => {
    expect(landingOutcome([40, 0, 30], 3, basket)).toBe('airborne');
  });
});

describe('shouldDecide', () => {
  it('decides at rest only after the minimum airborne time', () => {
    expect(REST_SPEED_CM_S).toBe(2);
    expect(shouldDecide(0, 0)).toBe(false);
    expect(shouldDecide(0, 0.1)).toBe(false);
    expect(shouldDecide(1.9, 0.3)).toBe(true);
    expect(shouldDecide(2, 0.3)).toBe(false);
  });

  it('decides after the 3 s timeout whatever the speed', () => {
    expect(LANDING_TIMEOUT_S).toBe(3);
    expect(shouldDecide(50, 2.99)).toBe(false);
    expect(shouldDecide(50, 3)).toBe(true);
  });
});
