import { describe, expect, it } from 'vitest';
import type { Vec3 } from '@tomato/shared';
import { COLLISION_MARGIN_CM, pathBlocked } from './collision';
import type { TomatoObstacle } from './collision';

const tomato: TomatoObstacle = { id: 7, positionCm: [0, 0, 50], radiusCm: 3 };
const stem: Vec3[] = [[0, 0, 0], [0, 0, 35], [0, 0, 70]];
const STEM_R = 1.1;

function expectVec(actual: Vec3, expected: Vec3): void {
  expect(actual[0]).toBeCloseTo(expected[0], 6);
  expect(actual[1]).toBeCloseTo(expected[1], 6);
  expect(actual[2]).toBeCloseTo(expected[2], 6);
}

describe('pathBlocked', () => {
  it('is free without obstacles', () => {
    expect(COLLISION_MARGIN_CM).toBe(0.5);
    expect(pathBlocked([20, 0, 50], [-20, 0, 50], [], [], STEM_R)).toEqual({ blocked: false });
  });

  it('blocks a path through a tomato and reports the tomato and the contact point', () => {
    const r = pathBlocked([20, 0, 50], [-20, 0, 50], [tomato], [], STEM_R);
    expect(r.blocked).toBe(true);
    if (!r.blocked) throw new Error('unreachable');
    expect(r.what).toBe('tomato');
    expect(r.id).toBe(7);
    expectVec(r.atCm, [0, 0, 50]);
  });

  it('applies the 0.5 cm margin around a tomato', () => {
    expect(pathBlocked([20, 4, 50], [-20, 4, 50], [tomato], [], STEM_R)).toEqual({ blocked: false });
    expect(pathBlocked([20, 3.2, 50], [-20, 3.2, 50], [tomato], [], STEM_R).blocked).toBe(true);
  });

  it('blocks a path through the main stem with its margin, without an id', () => {
    const r = pathBlocked([10, 0, 40], [-10, 0, 40], [], stem, STEM_R);
    expect(r).toMatchObject({ blocked: true, what: 'stem' });
    expect(r.blocked && r.id).toBeUndefined();
    if (r.blocked) expectVec(r.atCm, [0, 0, 40]);
    expect(pathBlocked([10, 2, 40], [-10, 2, 40], [], stem, STEM_R)).toEqual({ blocked: false });
    expect(pathBlocked([10, 1.4, 40], [-10, 1.4, 40], [], stem, STEM_R).blocked).toBe(true);
  });

  it('lets a move that starts inside a margin go away, but not closer', () => {
    expect(pathBlocked([3.2, 0, 50], [10, 0, 50], [tomato], [], STEM_R)).toEqual({ blocked: false });
    expect(pathBlocked([3.2, 0, 50], [1, 0, 50], [tomato], [], STEM_R).blocked).toBe(true);
    expect(pathBlocked([3.2, 0, 50], [3.2, 0, 50], [tomato], [], STEM_R)).toEqual({ blocked: false });
  });

  it('reports the first obstacle along the path', () => {
    const near: TomatoObstacle = { id: 2, positionCm: [10, 0, 40], radiusCm: 2 };
    const r = pathBlocked([20, 0, 40], [-20, 0, 40], [near], stem, STEM_R);
    expect(r).toMatchObject({ blocked: true, what: 'tomato', id: 2 });
  });

  it('ignores a tomato far above the path', () => {
    expect(pathBlocked([20, 0, 50], [-20, 0, 50], [{ id: 1, positionCm: [0, 0, 60], radiusCm: 3 }], [], STEM_R)).toEqual({ blocked: false });
  });
});
