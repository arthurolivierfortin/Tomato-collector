import { describe, expect, it } from 'vitest';
import { createDefaultWorld } from '@tomato/shared';
import type { Tomato, Vec3, WorldState } from '@tomato/shared';
import { closeAndCut, moveBasket, moveScissors, openScissors, rotateScissors, wrapDeg } from './robotState';
import type { PlantObstacles } from './robotState';

const NO_PLANT: PlantObstacles = { tomatoes: [], mainStem: [], stemRadiusCm: 1.1 };

function tomato(id: number, fromCm: Vec3, toCm: Vec3, positionCm: Vec3, attached = true): Tomato {
  return {
    id, state: 'ripe', ripeness: 1, positionCm, radiusCm: 3, stem: { fromCm, toCm }, attached,
    visibleIn: { top: 1, front: 1, side: 1 },
  };
}

function withTomatoes(state: WorldState, tomatoes: Tomato[]): WorldState {
  return { ...state, tomatoes };
}

function expectVec(actual: Vec3, expected: Vec3): void {
  expect(actual[0]).toBeCloseTo(expected[0], 6);
  expect(actual[1]).toBeCloseTo(expected[1], 6);
  expect(actual[2]).toBeCloseTo(expected[2], 6);
}

// ciseaux [45,-35,60] fermés, panier [0,0,5], base [60,-30,0]
const world = createDefaultWorld(1);

describe('moveScissors', () => {
  it('moves the cut point in absolute and relative mode', () => {
    const abs = moveScissors(world, 30, -20, 60, 'absolute', NO_PLANT);
    expect(abs.ok).toBe(true);
    expect(abs.state.scissors.cutPointCm).toEqual([30, -20, 60]);
    const rel = moveScissors(abs.state, -5, 0, 2, 'relative', NO_PLANT);
    expect(rel.ok).toBe(true);
    expect(rel.state.scissors.cutPointCm).toEqual([25, -20, 62]);
    expect(rel.message).toContain('(25, -20, 62)');
  });

  it('refuses out_of_reach with the measured distance and leaves the state unchanged', () => {
    const r = moveScissors(world, -30, 30, 60, 'absolute', NO_PLANT);
    expect(r.ok).toBe(false);
    if (r.ok) throw new Error('unreachable');
    expect(r.error).toBe('out_of_reach');
    expect(r.details?.distanceCm).toBeCloseTo(123.69, 2);
    expect(r.details?.reachCm).toBe(110);
    expect(r.state).toBe(world);
    const low = moveScissors(world, 40, -30, 2, 'absolute', NO_PLANT);
    expect(low.ok).toBe(false);
    if (low.ok) throw new Error('unreachable');
    expect(low.error).toBe('out_of_reach');
    expect(low.details?.minZCm).toBe(5);
  });

  it('refuses non-finite coordinates', () => {
    const r = moveScissors(world, Number.NaN, 0, 0, 'relative', NO_PLANT);
    expect(r.ok).toBe(false);
    if (r.ok) throw new Error('unreachable');
    expect(r.error).toBe('invalid_argument');
  });

  it('refuses a path through a tomato with the blocking position', () => {
    const plant: PlantObstacles = { ...NO_PLANT, tomatoes: [{ id: 7, positionCm: [30, -35, 60], radiusCm: 3 }] };
    const r = moveScissors(world, 10, -35, 60, 'absolute', plant);
    expect(r.ok).toBe(false);
    if (r.ok) throw new Error('unreachable');
    expect(r.error).toBe('collision');
    expect(r.details?.blockedBy).toBe('tomato');
    expect(r.details?.tomatoId).toBe(7);
    expect(r.details?.atX).toBeCloseTo(30, 2);
    expect(r.state.scissors.cutPointCm).toEqual([45, -35, 60]);
  });

  it('refuses a path through the main stem', () => {
    const plant: PlantObstacles = { ...NO_PLANT, mainStem: [[0, 0, 0], [0, 0, 70]] };
    const near = { ...world, scissors: { ...world.scissors, cutPointCm: [10, 0, 60] as Vec3 } };
    const r = moveScissors(near, -10, 0, 60, 'absolute', plant);
    expect(r.ok).toBe(false);
    if (r.ok) throw new Error('unreachable');
    expect(r.error).toBe('collision');
    expect(r.details?.blockedBy).toBe('stem');
    expect(r.details?.atX).toBeCloseTo(0, 2);
    expect(r.details?.tomatoId).toBeUndefined();
  });
});

describe('rotateScissors', () => {
  it('rotates relatively and recomputes the blade vectors', () => {
    const r = rotateScissors(world, 90, undefined, undefined, 'relative');
    expect(r.ok).toBe(true);
    expect(r.state.scissors.yawDeg).toBe(90);
    expect(r.state.scissors.pitchDeg).toBe(0);
    expectVec(r.state.scissors.bladeAxis, [0, -1, 0]);
    expectVec(r.state.scissors.bladeNormal, [0, 0, 1]);
    expect(r.state.scissors.cutPointCm).toEqual([45, -35, 60]);
  });

  it('sets only the given angles in absolute mode and wraps angles into [-180, 180)', () => {
    const r = rotateScissors(world, undefined, 30, undefined, 'absolute');
    expect(r.ok).toBe(true);
    expect(r.state.scissors.pitchDeg).toBe(30);
    expect(r.state.scissors.yawDeg).toBe(0);
    expect(rotateScissors(world, 270, undefined, undefined, 'relative').state.scissors.yawDeg).toBe(-90);
    expect(wrapDeg(180)).toBe(-180);
    expect(wrapDeg(-190)).toBe(170);
  });

  it('refuses a call without any angle or with a non-finite angle', () => {
    const none = rotateScissors(world, undefined, undefined, undefined, 'relative');
    expect(none.ok).toBe(false);
    if (none.ok) throw new Error('unreachable');
    expect(none.error).toBe('invalid_argument');
    const inf = rotateScissors(world, Number.POSITIVE_INFINITY, undefined, undefined, 'relative');
    expect(inf.ok).toBe(false);
  });
});

describe('openScissors / closeAndCut', () => {
  const stemThroughCutPoint = tomato(3, [45, -35, 65], [45, -35, 55], [45, -35, 52]);

  it('opens the blades to 60 degrees', () => {
    const r = openScissors(world);
    expect(r.ok).toBe(true);
    expect(r.state.scissors.openingDeg).toBe(60);
  });

  it('refuses to cut with closed blades', () => {
    const { result, cutTomatoId } = closeAndCut(withTomatoes(world, [stemThroughCutPoint]), []);
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('unreachable');
    expect(result.error).toBe('nothing_between_blades');
    expect(cutTomatoId).toBeNull();
  });

  it('cuts a stem between open blades, closes them and reports the tomato id', () => {
    const open = openScissors(withTomatoes(world, [stemThroughCutPoint])).state;
    const { result, cutTomatoId } = closeAndCut(open, []);
    expect(result.ok).toBe(true);
    expect(result.message).toContain('stem_cut');
    expect(result.state.scissors.openingDeg).toBe(0);
    expect(cutTomatoId).toBe(3);
  });

  it('reports misaligned with distance and angle, blades staying open', () => {
    const off = tomato(4, [45, -33, 65], [45, -33, 55], [45, -33, 52]);
    const open = openScissors(withTomatoes(world, [off])).state;
    const { result, cutTomatoId } = closeAndCut(open, []);
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('unreachable');
    expect(result.error).toBe('misaligned');
    expect(result.details?.distanceCm).toBeCloseTo(2, 2);
    expect(result.details?.angleDeg).toBeCloseTo(0, 2);
    expect(result.details?.tomatoId).toBe(4);
    expect(result.state.scissors.openingDeg).toBe(60);
    expect(cutTomatoId).toBeNull();
  });

  it('ignores detached tomatoes and reports leaf_cut or nothing_between_blades', () => {
    const detached = tomato(5, [45, -35, 65], [45, -35, 55], [45, -35, 52], false);
    const open = openScissors(withTomatoes(world, [detached])).state;
    const leaf = closeAndCut(open, [{ positionCm: [45, -33, 60], sizeCm: 10 }]);
    expect(leaf.result.ok).toBe(false);
    if (leaf.result.ok) throw new Error('unreachable');
    expect(leaf.result.error).toBe('leaf_cut');
    const nothing = closeAndCut(open, []);
    expect(nothing.result.ok).toBe(false);
    if (nothing.result.ok) throw new Error('unreachable');
    expect(nothing.result.error).toBe('nothing_between_blades');
    expect(nothing.result.details?.distanceCm).toBeUndefined();
  });
});

describe('moveBasket', () => {
  it('moves on the rail in absolute and relative mode, keeping the height', () => {
    const abs = moveBasket(world, 10, -5, 'absolute');
    expect(abs.ok).toBe(true);
    expect(abs.state.basket.centerCm).toEqual([10, -5, 5]);
    const rel = moveBasket(abs.state, -4, 2, 'relative');
    expect(rel.state.basket.centerCm).toEqual([6, -3, 5]);
  });

  it('refuses out_of_rail with the rail bounds and leaves the state unchanged', () => {
    const r = moveBasket(world, 45, 0, 'absolute');
    expect(r.ok).toBe(false);
    if (r.ok) throw new Error('unreachable');
    expect(r.error).toBe('out_of_rail');
    expect(r.details).toMatchObject({ x: 45, y: 0, railXMin: -40, railXMax: 40, railYMin: -40, railYMax: 40 });
    expect(r.state).toBe(world);
    expect(moveBasket(world, 0, -41, 'relative').ok).toBe(false);
  });
});
