import { describe, expect, it } from 'vitest';
import { VIEW_SIZE_PX, createDefaultWorld } from '@tomato/shared';
import type { ActionResult } from '@tomato/shared';
import type { SimContext } from '../core/module';
import { createSignals } from '../core/signals';
import { CAMERA_PIVOT_SPEED_DEG_S, CAMERA_SPEED_CM_S } from '../core/speeds';
import { createWorldStore } from '../core/store';
import { cameraModule, getRenderViews } from './cameraModule';

function ctx(): SimContext {
  return {
    store: createWorldStore(createDefaultWorld(1)),
    signals: createSignals(),
    emitEvent: () => undefined,
    scene: null,
    registry: { plantSpec: null },
  };
}

const settle = (): Promise<void> => new Promise((r) => setTimeout(r, 0));

async function advance(c: SimContext, dtS: number, steps: number): Promise<void> {
  for (let i = 0; i < steps; i++) {
    await settle();
    cameraModule.update!(dtS, c);
  }
  await settle();
}

const animated = (r: ActionResult | Promise<ActionResult> | null): Promise<ActionResult> => {
  if (r === null || !(r instanceof Promise)) throw new Error('attendu : une action animée');
  return r;
};

const now = (r: ActionResult | Promise<ActionResult> | null): ActionResult => {
  if (r === null || r instanceof Promise) throw new Error('attendu : un résultat immédiat');
  return r;
};

describe('cameraModule (without a scene)', () => {
  it('handles move_camera through the store and ignores other actions', async () => {
    const c = ctx();
    await cameraModule.init(c);
    expect(getRenderViews()).toBeNull();
    const r = now(cameraModule.handle!({ type: 'move_camera', camera: 'front', dy: 20 }, c, { instant: true }));
    expect(r.ok).toBe(true);
    expect(c.store.get().cameras.front.positionCm).toEqual([0, -80, 45]);
    expect(cameraModule.handle!({ type: 'cut' }, c, { instant: true })).toBeNull();
    const bad = now(cameraModule.handle!({ type: 'move_camera', camera: 'front', dy: 200 }, c, { instant: true }));
    expect(bad.ok).toBe(false);
    expect(c.store.get().cameras.front.positionCm).toEqual([0, -80, 45]);
  });

  it('update is a no-op without a scene', () => {
    const c = ctx();
    expect(() => cameraModule.update!(0.016, c)).not.toThrow();
  });
});

describe('cameraModule (mouvements animés)', () => {
  it('slides a camera at CAMERA_SPEED_CM_S and answers at the end of the travel', async () => {
    const c = ctx();
    await cameraModule.init(c);
    const p = animated(cameraModule.handle!({ type: 'move_camera', camera: 'front', dy: 20 }, c)); // 20 cm à 20 cm/s = 1 s
    await advance(c, 0.25, 2);
    expect(c.store.get().cameras.front.positionCm[1]).toBeCloseTo(-90, 6);
    await advance(c, 0.25, 3);
    expect((await p).ok).toBe(true);
    expect(c.store.get().cameras.front.positionCm).toEqual([0, -80, 45]);
    expect(CAMERA_SPEED_CM_S).toBe(20);
  });

  it('pivots at CAMERA_PIVOT_SPEED_DEG_S and keeps pxPerCm consistent while zooming', async () => {
    const c = ctx();
    await cameraModule.init(c);
    const p = animated(cameraModule.handle!({ type: 'move_camera', camera: 'top', yaw: 20, zoom: 2 }, c));
    await advance(c, 0.25, 1);
    const mid = c.store.get().cameras.top;
    expect(mid.yawDeg).toBeGreaterThan(0);
    expect(mid.yawDeg).toBeLessThan(20);
    expect(mid.pxPerCm).toBeCloseTo(VIEW_SIZE_PX / mid.widthCm, 6);
    await advance(c, 0.25, 3);
    expect((await p).ok).toBe(true);
    const end = c.store.get().cameras.top;
    expect(end.yawDeg).toBe(20);
    expect(end.widthCm).toBe(50);
    expect(CAMERA_PIVOT_SPEED_DEG_S).toBe(45);
  });

  it('refuses an off-rail move immediately, without moving', async () => {
    const c = ctx();
    await cameraModule.init(c);
    const before = c.store.get().cameras.side;
    const r = await animated(cameraModule.handle!({ type: 'move_camera', camera: 'side', dx: 200 }, c));
    expect(r.ok).toBe(false);
    if (r.ok) throw new Error('unreachable');
    expect(r.error).toBe('out_of_rail');
    expect(c.store.get().cameras.side).toBe(before);
  });

  it('queues two moves of the same camera and moves another one in parallel', async () => {
    const c = ctx();
    await cameraModule.init(c);
    const first = animated(cameraModule.handle!({ type: 'move_camera', camera: 'front', dy: 20 }, c));
    const second = animated(cameraModule.handle!({ type: 'move_camera', camera: 'front', dz: 20 }, c));
    const other = animated(cameraModule.handle!({ type: 'move_camera', camera: 'top', dx: 20 }, c));
    await advance(c, 0.25, 4);
    expect((await first).ok).toBe(true);
    expect((await other).ok).toBe(true); // la caméra top a fini en même temps : file séparée
    expect(c.store.get().cameras.front.positionCm).toEqual([0, -80, 45]);
    await advance(c, 0.25, 5);
    expect((await second).ok).toBe(true);
    expect(c.store.get().cameras.front.positionCm).toEqual([0, -80, 65]);
  });
});
