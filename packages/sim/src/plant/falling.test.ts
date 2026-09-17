import { describe, expect, it } from 'vitest';
import type { BasketPose, Tomato, Vec3 } from '@tomato/shared';
import { createFakePhysics } from './fakePhysics';
import { createFallTracker } from './falling';
import type { Landed } from './falling';
import type { PlantPhysics } from './physics';

const basket: BasketPose = { centerCm: [0, 0, 5], sizeCm: [20, 20], depthCm: 10 };

function tomato(id: number, positionCm: Vec3): Tomato {
  return {
    id, state: 'ripe', ripeness: 1, positionCm, radiusCm: 3,
    stem: { fromCm: positionCm, toCm: positionCm }, attached: false, visibleIn: { top: 1, front: 1, side: 1 },
  };
}

/** Fait tomber la tomate `id` pendant `seconds` en relisant sa position dans le faux moteur à chaque pas. */
function fall(physics: PlantPhysics, tracker: ReturnType<typeof createFallTracker>, id: number, seconds: number): Landed[] {
  const landed: Landed[] = [];
  for (let i = 0; i < seconds * 100; i++) {
    physics.step(0.01);
    landed.push(...tracker.advance(0.01, [tomato(id, physics.positionOf(id)!)], basket));
  }
  return landed;
}

describe('createFallTracker', () => {
  it('decides in_basket once at rest on the basket floor', () => {
    const physics = createFakePhysics();
    physics.setBasket(basket);
    physics.attach(1, [5, 0, 40], 3);
    const tracker = createFallTracker(physics);
    expect(tracker.release(tomato(1, [5, 0, 40]))).toBe(true);
    expect(tracker.isFalling(1)).toBe(true);
    expect(fall(physics, tracker, 1, 1)).toEqual([{ tomatoId: 1, inBasket: true }]);
    expect(tracker.isFalling(1)).toBe(false);
    expect(fall(physics, tracker, 1, 3)).toEqual([]);
  });

  it('decides floor (inBasket = false) outside the basket', () => {
    const physics = createFakePhysics();
    physics.setBasket(basket);
    physics.attach(2, [40, 0, 40], 3);
    const tracker = createFallTracker(physics);
    tracker.release(tomato(2, [40, 0, 40]));
    expect(fall(physics, tracker, 2, 1)).toEqual([{ tomatoId: 2, inBasket: false }]);
  });

  it('does not decide at the frame of the cut, and refuses a second release', () => {
    const physics = createFakePhysics();
    physics.attach(1, [5, 0, 40], 3);
    const tracker = createFallTracker(physics);
    tracker.release(tomato(1, [5, 0, 40]));
    expect(tracker.advance(0.01, [tomato(1, [5, 0, 40])], basket)).toEqual([]);
    expect(tracker.release(tomato(1, [5, 0, 40]))).toBe(false);
  });

  it('decides after 3 s even if the tomato never rests (airborne → inBasket = false)', () => {
    const never: PlantPhysics = {
      attach: () => undefined, release: () => undefined, clear: () => undefined, step: () => undefined,
      positionOf: () => [0, 0, 60], speedOf: () => 50, setBasket: () => undefined, dispose: () => undefined,
    };
    const tracker = createFallTracker(never);
    tracker.release(tomato(3, [0, 0, 60]));
    const landed: Landed[] = [];
    for (let i = 0; i < 8; i++) landed.push(...tracker.advance(0.5, [tomato(3, [0, 0, 60])], basket));
    expect(landed).toEqual([{ tomatoId: 3, inBasket: false }]);
  });

  it('drops a falling tomato that disappeared from the store, and forgets everything on reset', () => {
    const physics = createFakePhysics();
    physics.attach(1, [5, 0, 40], 3);
    const tracker = createFallTracker(physics);
    tracker.release(tomato(1, [5, 0, 40]));
    expect(tracker.advance(0.01, [], basket)).toEqual([]);
    expect(tracker.isFalling(1)).toBe(false);
    tracker.release(tomato(1, [5, 0, 40]));
    tracker.reset();
    expect(tracker.isFalling(1)).toBe(false);
  });
});
