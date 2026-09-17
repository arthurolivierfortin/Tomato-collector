import { describe, expect, it } from 'vitest';
import { createDefaultWorld } from '@tomato/shared';
import { WIDTH_RANGE_CM, moveCamera } from './cameraState';

const world = createDefaultWorld(1); // front à [0, -100, 45], rail front x [-40, 40], y [-160, -70], z [10, 100], pivot 25°

describe('moveCamera', () => {
  it('translates along the rails and reports the new pose', () => {
    const r = moveCamera(world, { type: 'move_camera', camera: 'front', dx: 10, dz: -5 });
    expect(r.ok).toBe(true);
    expect(r.state.cameras.front.positionCm).toEqual([10, -100, 40]);
    expect(r.state.cameras.top).toBe(world.cameras.top);
    expect(r.message).toContain('camera front');
  });

  it('refuses a move outside the rail with out_of_rail and numeric details, state unchanged', () => {
    const r = moveCamera(world, { type: 'move_camera', camera: 'front', dx: 50 });
    expect(r.ok).toBe(false);
    if (r.ok) throw new Error('unreachable');
    expect(r.error).toBe('out_of_rail');
    expect(r.details).toEqual({ axis: 'x', requestedCm: 50, minCm: -40, maxCm: 40 });
    expect(r.state).toBe(world);
  });

  it('clamps yaw and tilt to ±cameraPivotDeg', () => {
    const r = moveCamera(world, { type: 'move_camera', camera: 'side', yaw: 40, tilt: -30 });
    expect(r.ok).toBe(true);
    expect(r.state.cameras.side.yawDeg).toBe(25);
    expect(r.state.cameras.side.tiltDeg).toBe(-25);
    expect(r.message).toContain('clamped');
  });

  it('zoom divides the field width and recomputes px/cm, within [20, 200] cm', () => {
    const r = moveCamera(world, { type: 'move_camera', camera: 'top', zoom: 2 });
    expect(r.state.cameras.top.widthCm).toBe(50);
    expect(r.state.cameras.top.pxPerCm).toBe(16);
    const wide = moveCamera(world, { type: 'move_camera', camera: 'top', zoom: 0.01 });
    expect(wide.state.cameras.top.widthCm).toBe(WIDTH_RANGE_CM[1]);
    const tight = moveCamera(world, { type: 'move_camera', camera: 'top', zoom: 100 });
    expect(tight.state.cameras.top.widthCm).toBe(WIDTH_RANGE_CM[0]);
  });

  it('rejects a non-positive zoom with invalid_argument', () => {
    const r = moveCamera(world, { type: 'move_camera', camera: 'top', zoom: 0 });
    expect(r.ok).toBe(false);
    if (r.ok) throw new Error('unreachable');
    expect(r.error).toBe('invalid_argument');
  });

  it('accumulates relative moves', () => {
    const a = moveCamera(world, { type: 'move_camera', camera: 'top', yaw: 10 });
    const b = moveCamera(a.state, { type: 'move_camera', camera: 'top', yaw: 10 });
    expect(b.state.cameras.top.yawDeg).toBe(20);
  });
});
