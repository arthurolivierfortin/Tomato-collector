import { describe, expect, it } from 'vitest';
import type { BasketPose } from '@tomato/shared';
import { createFakePhysics } from './fakePhysics';

const basket: BasketPose = { centerCm: [0, 0, 5], sizeCm: [20, 20], depthCm: 10 };

function settle(physics: { step(dt: number): void }, seconds: number): void {
  for (let i = 0; i < seconds * 100; i++) physics.step(0.01);
}

describe('createFakePhysics', () => {
  it('keeps an attached tomato in place', () => {
    const p = createFakePhysics();
    p.attach(1, [10, 0, 45], 3);
    settle(p, 1);
    expect(p.positionOf(1)).toEqual([10, 0, 45]);
    expect(p.speedOf(1)).toBe(0);
    expect(p.positionOf(99)).toBeNull();
  });

  it('drops a released tomato onto the floor outside the basket', () => {
    const p = createFakePhysics();
    p.setBasket(basket);
    p.attach(1, [40, 0, 45], 3);
    p.release(1, 3.9);
    p.step(0.1);
    expect(p.speedOf(1)).toBeGreaterThan(50);
    settle(p, 1);
    expect(p.positionOf(1)).toEqual([40, 0, 3.9]);
    expect(p.speedOf(1)).toBe(0);
  });

  it('drops a released tomato onto the basket floor when XY is inside', () => {
    const p = createFakePhysics();
    p.setBasket(basket);
    p.attach(2, [5, -5, 45], 3);
    p.release(2, 3);
    settle(p, 1);
    expect(p.positionOf(2)).toEqual([5, -5, 8]);
  });

  it('forgets every body on clear', () => {
    const p = createFakePhysics();
    p.attach(1, [0, 0, 40], 3);
    p.clear();
    expect(p.positionOf(1)).toBeNull();
  });
});
