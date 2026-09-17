import { describe, expect, it } from 'vitest';
import { Vector3 } from 'three';
import { threeToWorld, worldToThree } from './frame';

describe('world <-> three frame', () => {
  it('maps world Z up to three Y up and world Y back to three -Z', () => {
    const v = worldToThree([10, 20, 30]);
    expect([v.x, v.y, v.z]).toEqual([10, 30, -20]);
  });

  it('round-trips', () => {
    expect(threeToWorld(worldToThree([1, -2, 3]))).toEqual([1, -2, 3]);
    expect(threeToWorld(new Vector3(5, 6, 7))).toEqual([5, -7, 6]);
  });
});
