import { describe, expect, it } from 'vitest';
import { createAngleTween, createLane, createTimedTween, createTween, shortestDeltaDeg } from './animation';

describe('createTween', () => {
  it('lasts distance / speed and passes exactly through the mid-point', () => {
    const t = createTween([0, 0, 0], [6, 8, 0], 5); // 10 cm à 5 cm/s = 2 s
    expect(t.durationS).toBeCloseTo(2, 10);
    expect(t.done).toBe(false);
    expect(t.step(1)).toEqual([3, 4, 0]);
    expect(t.done).toBe(false);
  });

  it('lands exactly on the target and reports done', () => {
    const t = createTween([0, 0, 0], [30, 0, 0], 15);
    t.step(1);
    expect(t.done).toBe(false);
    expect(t.step(1)).toEqual([30, 0, 0]);
    expect(t.done).toBe(true);
    expect(t.step(5)).toEqual([30, 0, 0]); // pas de dépassement
  });

  it('does not move with dt = 0', () => {
    const t = createTween([1, 2, 3], [11, 2, 3], 15);
    expect(t.step(0)).toEqual([1, 2, 3]);
    expect(t.done).toBe(false);
    t.step(0.2);
    const mid = t.value();
    expect(t.step(0)).toEqual(mid);
  });

  it('is done from the start when there is nothing to travel', () => {
    const t = createTween([4, 4, 4], [4, 4, 4], 15);
    expect(t.durationS).toBe(0);
    expect(t.done).toBe(true);
    expect(t.value()).toEqual([4, 4, 4]);
  });
});

describe('shortestDeltaDeg', () => {
  it('takes the short way round', () => {
    expect(shortestDeltaDeg(0, 350)).toBe(-10);
    expect(shortestDeltaDeg(170, -170)).toBe(20);
    expect(shortestDeltaDeg(-170, 170)).toBe(-20);
    expect(shortestDeltaDeg(10, 100)).toBe(90);
    expect(shortestDeltaDeg(0, 180)).toBe(-180); // demi-tour : sens négatif par convention
  });
});

describe('createAngleTween', () => {
  it('lasts angle / speed and passes exactly through the mid-angle', () => {
    const t = createAngleTween(10, 100, 45); // 90° à 45°/s = 2 s
    expect(t.durationS).toBeCloseTo(2, 10);
    expect(t.step(1)).toBe(55);
    expect(t.step(1)).toBe(100);
    expect(t.done).toBe(true);
  });

  it('crosses ±180 by the short way and lands exactly on the target', () => {
    const t = createAngleTween(170, -170, 45); // 20° en 4/9 s
    expect(t.durationS).toBeCloseTo(20 / 45, 10);
    expect(t.step(10 / 45)).toBe(-180); // 180° ramené dans [-180, 180)
    expect(t.step(10 / 45)).toBe(-170);
    expect(t.done).toBe(true);
  });

  it('is done from the start without any rotation', () => {
    const t = createAngleTween(30, 30, 45);
    expect(t.durationS).toBe(0);
    expect(t.done).toBe(true);
    expect(t.value()).toBe(30);
  });
});

describe('createTimedTween', () => {
  it('interpolates over a fixed duration', () => {
    const t = createTimedTween(0, 60, 0.5);
    expect(t.durationS).toBe(0.5);
    expect(t.step(0.25)).toBe(30);
    expect(t.done).toBe(false);
    expect(t.step(0.25)).toBe(60);
    expect(t.done).toBe(true);
  });

  it('is done from the start with a zero duration', () => {
    const t = createTimedTween(0, 60, 0);
    expect(t.done).toBe(true);
    expect(t.value()).toBe(60);
  });
});

describe('createLane', () => {
  it('runs tasks one after the other, in order', async () => {
    const lane = createLane();
    const order: string[] = [];
    let releaseFirst = (): void => undefined;
    const first = lane.run(async () => {
      order.push('start-1');
      await new Promise<void>((r) => {
        releaseFirst = r;
      });
      order.push('end-1');
      return 1;
    });
    const second = lane.run(() => {
      order.push('start-2');
      return Promise.resolve(2);
    });
    await Promise.resolve();
    expect(order).toEqual(['start-1']);
    releaseFirst();
    expect(await first).toBe(1);
    expect(await second).toBe(2);
    expect(order).toEqual(['start-1', 'end-1', 'start-2']);
  });

  it('keeps running after a task rejects', async () => {
    const lane = createLane();
    const failed = lane.run(() => Promise.reject(new Error('boom')));
    const after = lane.run(() => Promise.resolve('ok'));
    await expect(failed).rejects.toThrow('boom');
    expect(await after).toBe('ok');
  });
});
