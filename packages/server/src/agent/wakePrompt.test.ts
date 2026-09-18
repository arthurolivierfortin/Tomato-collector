import { describe, expect, it } from 'vitest';
import { createDefaultWorld } from '@tomato/shared';
import type { Tomato, WorldState } from '@tomato/shared';
import { buildWakePrompt, summarizeWorld } from './wakePrompt';

const tomato = (id: number, state: Tomato['state']): Tomato => ({
  id,
  state,
  ripeness: state === 'ripe' ? 1 : 0.2,
  positionCm: [10, -5, 40],
  radiusCm: 3,
  stem: { fromCm: [8, -4, 44], toCm: [10, -5, 43] },
  attached: true,
  visibleIn: { top: 1, front: 1, side: 1 },
});

describe('summarizeWorld', () => {
  it('says so when no state has been received', () => {
    expect(summarizeWorld(null)).toMatch(/no simulation state/);
  });

  // Issue #36 : la maturité vient du détecteur, donc le résumé ne recopie plus la vérité terrain.
  it('lists sim time, tomato count, scissors and basket in cm without the ground-truth ripe ids', () => {
    const w: WorldState = { ...createDefaultWorld(1), simTimeS: 12.34, tomatoes: [tomato(1, 'unripe'), tomato(3, 'ripe')] };
    const s = summarizeWorld(w);
    expect(s).toContain('sim time 12.3 s');
    expect(s).toContain('2 tomatoes on the plant');
    expect(s).not.toContain('ripe:');
    expect(s).toContain('scissors cut point at X 45.0, Y -35.0, Z 60.0 cm, closed');
    expect(s).toContain('basket centre at X 0.0, Y 0.0 cm');
  });
});

describe('buildWakePrompt', () => {
  const event = { tomatoId: 3, positionCm: [12, -4.25, 38.04] as const, detector: 'yolo' as const, confidence: 0.61 };

  it('names the target with its position in cm, the detector, the status, the limit and the first call', () => {
    const p = buildWakePrompt(event, 'status text', { resumed: false });
    // Issue #36 : le prompt cite la confiance du détecteur, jamais la maturité connue de la sim.
    expect(p).toContain('tomato #3 at X 12.0, Y -4.3, Z 38.0 cm, seen ripe by yolo with confidence 0.61');
    expect(p).not.toContain('ripeness');
    expect(p).toContain('Current status: status text');
    expect(p).toContain('at most 40 tool calls');
    expect(p).toContain('report');
    expect(p).toMatch(/Start with get_views\.$/);
    expect(p).not.toContain('New episode');
  });

  it('warns that earlier positions are stale when the session is resumed', () => {
    const p = buildWakePrompt(event, 'status', { resumed: true });
    expect(p.startsWith('New episode.')).toBe(true);
    expect(p).toContain('stale');
  });
});
