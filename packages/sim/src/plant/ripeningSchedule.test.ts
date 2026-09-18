import { describe, expect, it } from 'vitest';
import {
  FIRST_RIPENING_START_S,
  RIPENING_GAP_S,
  nextRipeningStart,
  type RipeningInput,
} from './ripeningSchedule';

const t = (id: number, attached = true, ripeness = 0): RipeningInput['tomatoes'][number] => ({ id, attached, ripeness });

describe('nextRipeningStart', () => {
  it('schedules the lowest id at 3 s when the plant has just been loaded', () => {
    expect(FIRST_RIPENING_START_S).toBe(3);
    expect(nextRipeningStart({ simTimeS: 0, tomatoes: [t(2), t(1), t(3)], currentId: null })).toEqual({
      currentId: 1,
      startAtS: 3,
    });
  });

  it('leaves the current tomato alone while it is still attached', () => {
    const tomatoes = [t(1, true, 0.4), t(2), t(3)];
    expect(nextRipeningStart({ simTimeS: 9, tomatoes, currentId: 1 })).toEqual({ currentId: 1, startAtS: null });
    // Même mûre à 100 %, tant qu'elle pend, elle occupe la place : personne d'autre ne démarre.
    const ripe = [t(1, true, 1), t(2), t(3)];
    expect(nextRipeningStart({ simTimeS: 30, tomatoes: ripe, currentId: 1 })).toEqual({ currentId: 1, startAtS: null });
  });

  it('starts the next attached tomato 4 s after the current one was cut or fell', () => {
    expect(RIPENING_GAP_S).toBe(4);
    const tomatoes = [t(1, false, 1), t(3), t(2)];
    expect(nextRipeningStart({ simTimeS: 21.5, tomatoes, currentId: 1 })).toEqual({ currentId: 2, startAtS: 25.5 });
  });

  it('picks the next by ascending id and skips tomatoes already ripe or detached', () => {
    const tomatoes = [t(1, false, 1), t(2, false, 1), t(3, false, 0.2), t(4), t(5)];
    expect(nextRipeningStart({ simTimeS: 40, tomatoes, currentId: 2 })).toEqual({ currentId: 4, startAtS: 44 });
  });

  it('returns no current tomato when nothing attached is left to ripen', () => {
    const tomatoes = [t(1, false, 1), t(2, false, 1)];
    expect(nextRipeningStart({ simTimeS: 50, tomatoes, currentId: 2 })).toEqual({ currentId: null, startAtS: null });
    expect(nextRipeningStart({ simTimeS: 50, tomatoes: [], currentId: null })).toEqual({ currentId: null, startAtS: null });
  });

  it('keeps the 4 s gap after a manual ripen even when the scheduler lost its current id', () => {
    // Un fruit déjà détaché prouve que le plant a vécu : on ne retombe pas sur le départ à 3 s.
    const tomatoes = [t(1, false, 1), t(2), t(3)];
    expect(nextRipeningStart({ simTimeS: 30, tomatoes, currentId: null })).toEqual({ currentId: 2, startAtS: 34 });
  });

  it('is pure: it never mutates the tomatoes it is given', () => {
    const tomatoes = [t(3), t(1), t(2)];
    const copy = tomatoes.map((x) => ({ ...x }));
    nextRipeningStart({ simTimeS: 0, tomatoes, currentId: null });
    expect(tomatoes).toEqual(copy);
  });
});
