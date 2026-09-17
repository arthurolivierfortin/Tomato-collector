import { describe, expect, it } from 'vitest';
import { CAMERA_IDS, createDefaultWorld } from './world';

describe('createDefaultWorld', () => {
  const w = createDefaultWorld(42);

  it('starts idle, unpaused, at t=0 with the given seed', () => {
    expect(w.phase).toBe('idle');
    expect(w.paused).toBe(false);
    expect(w.simTimeS).toBe(0);
    expect(w.seed).toBe(42);
    expect(w.targetTomatoId).toBeNull();
    expect(w.tomatoes).toEqual([]);
  });

  it('has the three orthographic cameras on their rails', () => {
    expect(CAMERA_IDS).toEqual(['top', 'front', 'side']);
    expect(w.cameras.top.positionCm[2]).toBeGreaterThan(80);
    expect(w.cameras.front.positionCm[1]).toBeLessThan(0);
    expect(w.cameras.side.positionCm[0]).toBeGreaterThan(0);
    for (const id of CAMERA_IDS) {
      expect(w.cameras[id].widthCm).toBeGreaterThan(0);
      expect(w.cameras[id].pxPerCm).toBeCloseTo(800 / w.cameras[id].widthCm);
    }
  });

  it('places the basket under the plant within its rail', () => {
    const [x, y] = w.basket.centerCm;
    expect(x).toBeGreaterThanOrEqual(w.limits.basketRailCm.x[0]);
    expect(x).toBeLessThanOrEqual(w.limits.basketRailCm.x[1]);
    expect(y).toBeGreaterThanOrEqual(w.limits.basketRailCm.y[0]);
    expect(y).toBeLessThanOrEqual(w.limits.basketRailCm.y[1]);
    expect(w.basket.sizeCm).toEqual([20, 20]);
    expect(w.basket.depthCm).toBe(10);
  });

  it('starts with closed scissors away from the plant', () => {
    expect(w.scissors.openingDeg).toBe(0);
    expect(Math.hypot(...w.scissors.cutPointCm)).toBeGreaterThan(30);
  });
});
