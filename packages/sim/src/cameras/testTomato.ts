import type { Tomato, TomatoState, Vec3 } from '@tomato/shared';

const RIPENESS: Record<TomatoState, number> = { unripe: 0, turning: 0.5, ripe: 1 };

/** Tomate de test : rayon 3 cm, pédoncule vertical de 5 cm au-dessus du fruit, visible partout. */
export function testTomato(id: number, positionCm: Vec3, state: TomatoState = 'ripe'): Tomato {
  const [x, y, z] = positionCm;
  return {
    id,
    state,
    ripeness: RIPENESS[state],
    positionCm,
    radiusCm: 3,
    stem: { fromCm: [x, y, z + 8], toCm: [x, y, z + 3] },
    attached: true,
    visibleIn: { top: 1, front: 1, side: 1 },
  };
}
