import { describe, expect, it } from 'vitest';
import type { Vec3 } from '@tomato/shared';
import type { CameraBasis } from './ortho';
import { frustumStubVertices } from './agentCameras';

const AXIS_ALIGNED: CameraBasis = { forward: [0, 1, 0], right: [1, 0, 0], up: [0, 0, 1] };

describe('frustumStubVertices', () => {
  it('returns 8 vertices, paired (proche, loin) per coin, near the camera then depthCm along forward', () => {
    const position: Vec3 = [10, -20, 45];
    const vertices = frustumStubVertices(position, AXIS_ALIGNED, 6, 20);
    expect(vertices).toHaveLength(8);

    // Coin haut-gauche (right = −1, up = +1) : premiers deux sommets de la paire.
    expect(vertices[0]).toEqual([7, -20, 48]);
    expect(vertices[1]).toEqual([7, 0, 48]);

    // Chaque coin lointain est à exactement depthCm du coin proche correspondant, le long de `forward`.
    for (let i = 0; i < vertices.length; i += 2) {
      const near = vertices[i]!;
      const far = vertices[i + 1]!;
      expect(far[0]).toBeCloseTo(near[0]);
      expect(far[2]).toBeCloseTo(near[2]);
      expect(far[1] - near[1]).toBeCloseTo(20);
    }
  });

  it('spans widthCm across right/up around position for every near corner', () => {
    const position: Vec3 = [0, 0, 0];
    const vertices = frustumStubVertices(position, AXIS_ALIGNED, 6, 20);
    const nearCorners = vertices.filter((_, i) => i % 2 === 0);
    for (const [x, , z] of nearCorners) {
      expect(Math.abs(x)).toBeCloseTo(3);
      expect(Math.abs(z)).toBeCloseTo(3);
    }
  });
});
