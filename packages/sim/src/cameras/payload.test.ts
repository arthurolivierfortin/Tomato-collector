import { describe, expect, it } from 'vitest';
import { createDefaultWorld } from '@tomato/shared';
import { toViewsPayload } from './payload';
import { testTomato } from './testTomato';

describe('toViewsPayload', () => {
  it('copies time, phase, target, tools, cameras and limits from the world', () => {
    const w = { ...createDefaultWorld(1), simTimeS: 12.5, targetTomatoId: 2 };
    const p = toViewsPayload(w);
    expect(p.simTimeS).toBe(12.5);
    expect(p.phase).toBe('idle');
    expect(p.targetTomatoId).toBe(2);
    expect(p.tomatoes).toEqual([]);
    expect(p.scissors).toBe(w.scissors);
    expect(p.basket).toBe(w.basket);
    expect(p.cameras).toBe(w.cameras);
    expect(p.limits).toBe(w.limits);
  });

  it('exposes each tomato as a TomatoView without radius or attachment', () => {
    const t = { ...testTomato(4, [10, -5, 50], 'turning'), visibleIn: { top: 1, front: 0.3, side: 0 } };
    const p = toViewsPayload({ ...createDefaultWorld(1), tomatoes: [t] });
    expect(p.tomatoes).toEqual([
      { id: 4, state: 'turning', ripeness: 0.5, positionCm: [10, -5, 50], stem: t.stem, visibleIn: { top: 1, front: 0.3, side: 0 } },
    ]);
    expect('radiusCm' in p.tomatoes[0]!).toBe(false);
  });
});
