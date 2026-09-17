import { describe, expect, it } from 'vitest';
import {
  angleBetweenDeg, closestPointOnSegment, closestPointsSegments, distancePointSegment, distanceSegmentSegment,
} from './geometry';

describe('distancePointSegment', () => {
  const a = [0, 0, 0] as const;
  const b = [0, 0, 10] as const;

  it('is zero on the segment and the perpendicular distance beside it', () => {
    expect(distancePointSegment([0, 0, 5], a, b)).toBeCloseTo(0, 9);
    expect(distancePointSegment([3, 0, 5], a, b)).toBeCloseTo(3, 9);
  });

  it('clamps to the end points beyond the segment', () => {
    expect(distancePointSegment([0, 0, -4], a, b)).toBeCloseTo(4, 9);
    expect(distancePointSegment([3, 4, 15], a, b)).toBeCloseTo(Math.sqrt(50), 9);
  });

  it('reports the closest point and its parameter', () => {
    const c = closestPointOnSegment([3, 0, 7.5], a, b);
    expect(c.t).toBeCloseTo(0.75, 9);
    expect(c.pointCm).toEqual([0, 0, 7.5]);
    expect(c.distanceCm).toBeCloseTo(3, 9);
  });

  it('handles a degenerate segment as a point', () => {
    expect(distancePointSegment([3, 4, 0], a, a)).toBeCloseTo(5, 9);
  });
});

describe('distanceSegmentSegment', () => {
  it('measures parallel, crossing and disjoint collinear segments', () => {
    expect(distanceSegmentSegment([0, 0, 0], [10, 0, 0], [0, 2, 0], [10, 2, 0])).toBeCloseTo(2, 9);
    expect(distanceSegmentSegment([0, 0, 0], [10, 0, 0], [5, -5, 3], [5, 5, 3])).toBeCloseTo(3, 9);
    expect(distanceSegmentSegment([0, 0, 0], [1, 0, 0], [5, 0, 0], [6, 0, 0])).toBeCloseTo(4, 9);
  });

  it('returns the closest points and parameters of a skew crossing', () => {
    const c = closestPointsSegments([0, 0, 0], [10, 0, 0], [5, -5, 3], [5, 5, 3]);
    expect(c.s).toBeCloseTo(0.5, 9);
    expect(c.t).toBeCloseTo(0.5, 9);
    expect(c.aCm).toEqual([5, 0, 0]);
    expect(c.bCm).toEqual([5, 0, 3]);
    expect(c.distanceCm).toBeCloseTo(3, 9);
  });

  it('is symmetric', () => {
    const d1 = distanceSegmentSegment([1, 2, 3], [4, 5, 6], [-2, 0, 1], [0, 0, 9]);
    const d2 = distanceSegmentSegment([-2, 0, 1], [0, 0, 9], [1, 2, 3], [4, 5, 6]);
    expect(d1).toBeCloseTo(d2, 9);
  });
});

describe('angleBetweenDeg', () => {
  it('is 0 for parallel or anti-parallel and 90 for perpendicular directions', () => {
    expect(angleBetweenDeg([1, 0, 0], [2, 0, 0])).toBeCloseTo(0, 9);
    expect(angleBetweenDeg([1, 0, 0], [-1, 0, 0])).toBeCloseTo(0, 9);
    expect(angleBetweenDeg([1, 0, 0], [0, 1, 0])).toBeCloseTo(90, 9);
    expect(angleBetweenDeg([1, 0, 0], [1, 1, 0])).toBeCloseTo(45, 9);
    expect(angleBetweenDeg([0, 0, 1], [1, 0, -1])).toBeCloseTo(45, 9);
  });

  it('returns 0 for a null vector instead of NaN', () => {
    expect(angleBetweenDeg([0, 0, 0], [1, 0, 0])).toBe(0);
  });
});
