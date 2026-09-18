import { createDefaultWorld } from '@tomato/shared';
import { describe, expect, it } from 'vitest';
import { formatRipening, ripeningOf } from './ripening';

const world = createDefaultWorld(1);
const tomato = (id: number, ripeness: number, attached = true) => ({ ...world.tomatoes[0]!, id, ripeness, attached });

describe('ripening — tomate en cours de mûrissement (issue #23)', () => {
  it('picks the attached tomato whose ramp is running', () => {
    expect(ripeningOf({ ...world, tomatoes: [tomato(1, 1, false), tomato(2, 0.62), tomato(3, 0)] })).toEqual({ tomatoId: 2, ripeness: 0.62 });
  });

  it('falls back to the ripe tomato still on the plant, which waits to be cut', () => {
    expect(ripeningOf({ ...world, tomatoes: [tomato(1, 1), tomato(2, 0)] })).toEqual({ tomatoId: 1, ripeness: 1 });
  });

  it('reports nothing when no ramp has started and nothing is ripe', () => {
    expect(ripeningOf({ ...world, tomatoes: [tomato(1, 0), tomato(2, 0)] })).toBeNull();
    expect(ripeningOf({ ...world, tomatoes: [] })).toBeNull();
    // Une tomate détachée ne mûrit plus, même à mi-rampe.
    expect(ripeningOf({ ...world, tomatoes: [tomato(1, 0.4, false)] })).toBeNull();
  });

  it('reads as a sentence in the status bar', () => {
    // Un mot, pas un tiret cadratin : le bandeau est filmé et la vidéo n'en porte aucun.
    expect(formatRipening(null)).toBe('aucun');
    expect(formatRipening({ tomatoId: 3, ripeness: 0.618 })).toBe('tomate 3 : mûrit 62 %');
    expect(formatRipening({ tomatoId: 3, ripeness: 1 })).toBe('tomate 3 : mûre');
  });
});
