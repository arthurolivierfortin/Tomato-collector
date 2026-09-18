import { createDefaultWorld, fail, ok, vdot, vnorm } from '@tomato/shared';
import type { Vec3, ViewsPayload } from '@tomato/shared';
import { describe, expect, it } from 'vitest';
import { actionResultText, bladeAnglesForStem, compactJson, detailsText, fr, frVec, suggestedScissorsText, summarizeAction, viewHeader } from './format';

const world = createDefaultWorld(1);

describe('fr / frVec / compactJson', () => {
  it('formats numbers the French way with at most one decimal', () => {
    expect(fr(12)).toBe('12');
    expect(fr(1.44)).toBe('1,4');
    expect(fr(-2.05)).toBe('-2');
    expect(frVec([12, 4.26, 38])).toBe('X 12, Y 4,3, Z 38');
    expect(compactJson({ a: 1.23456, b: [0.005, 'x'] })).toBe('{"a":1.23,"b":[0.01,"x"]}');
  });
});

describe('viewHeader and detailsText', () => {
  it('names the view, its image axes and the scale', () => {
    const image = { camera: 'front' as const, pngBase64: '', widthPx: 800, heightPx: 800 };
    expect(viewHeader(image, world.cameras.front)).toBe('Vue front — axes X→ Z↑ — 8 px/cm');
    expect(viewHeader({ ...image, camera: 'top' }, world.cameras.top)).toBe('Vue top — axes X→ Y↑ — 8 px/cm');
    expect(detailsText({ distanceCm: 1.42, angleDeg: 62, axis: 'x' })).toBe('1,4 cm, 62°, axis x');
    expect(detailsText(undefined)).toBe('');
  });
});

describe('actionResultText and summarizeAction', () => {
  it('renders ok results with an optional focused JSON', () => {
    const r = ok(world, 'stem_cut');
    expect(actionResultText(r)).toBe('ok : stem_cut');
    expect(actionResultText(r, { z: 5.005 })).toBe('ok : stem_cut\n{"z":5.01}');
  });

  it('renders failures as « code : message (détails) », never throwing', () => {
    const r = fail(world, 'misaligned', 'cut line is off the stem', { distanceCm: 1.4, angleDeg: 62 });
    expect(actionResultText(r)).toBe('misaligned : cut line is off the stem (1,4 cm, 62°)');
    expect(actionResultText(fail(world, 'out_of_reach', 'too far'))).toBe('out_of_reach : too far');
  });

  it('writes the one-line French summaries of the architecture', () => {
    const moved = { ...world, scissors: { ...world.scissors, cutPointCm: [12, 4, 38] as const } };
    expect(summarizeAction('move_scissors', ok(moved, 'moved'))).toBe('ciseaux vers X 12, Y 4, Z 38');
    expect(summarizeAction('cut', fail(world, 'misaligned', 'off', { distanceCm: 1.4, angleDeg: 62 }))).toBe('coupe : misaligned, 1,4 cm, 62°');
    expect(summarizeAction('cut', ok(world, 'stem_cut'))).toBe('coupe : stem_cut');
    expect(summarizeAction('move_basket', ok(world, 'moved'))).toBe('panier à X 0, Y 0');
    expect(summarizeAction('move_basket', fail(world, 'out_of_rail', 'x too far'))).toBe('panier : out_of_rail');
    expect(summarizeAction('open_scissors', ok({ ...world, scissors: { ...world.scissors, openingDeg: 30 } }, 'open'))).toBe('ciseaux ouverts (30°)');
    expect(summarizeAction('rotate_scissors', ok(world, 'r'))).toBe('ciseaux lacet 0, tangage 0, roulis 0');
  });
});

/**
 * Composition Rz(lacet) · Ry(tangage) · Rx(roulis) recopiée de `packages/sim/src/robot/rotation.ts`,
 * pour vérifier `bladeAnglesForStem` contre l'orientation réellement appliquée par la sim.
 */
function vectorsFromAngles(yawDeg: number, pitchDeg: number, rollDeg: number): { bladeAxis: Vec3; bladeNormal: Vec3 } {
  const rad = (d: number): number => (d * Math.PI) / 180;
  const rotZ = (d: number): number[][] => [[Math.cos(rad(d)), -Math.sin(rad(d)), 0], [Math.sin(rad(d)), Math.cos(rad(d)), 0], [0, 0, 1]];
  const rotY = (d: number): number[][] => [[Math.cos(rad(d)), 0, Math.sin(rad(d))], [0, 1, 0], [-Math.sin(rad(d)), 0, Math.cos(rad(d))]];
  const rotX = (d: number): number[][] => [[1, 0, 0], [0, Math.cos(rad(d)), -Math.sin(rad(d))], [0, Math.sin(rad(d)), Math.cos(rad(d))]];
  const mul = (a: number[][], b: number[][]): number[][] => a.map((r) => [0, 1, 2].map((j) => r[0]! * b[0]![j]! + r[1]! * b[1]![j]! + r[2]! * b[2]![j]!));
  const m = mul(rotZ(yawDeg), mul(rotY(pitchDeg), rotX(rollDeg)));
  const apply = (v: Vec3): Vec3 => [m[0]![0]! * v[0] + m[0]![1]! * v[1] + m[0]![2]! * v[2], m[1]![0]! * v[0] + m[1]![1]! * v[1] + m[1]![2]! * v[2], m[2]![0]! * v[0] + m[2]![1]! * v[1] + m[2]![2]! * v[2]];
  return { bladeAxis: apply([-1, 0, 0]), bladeNormal: apply([0, 0, 1]) };
}

/** Directions de tige réelles (séance du 2026-09-18), normalisées et retournées pour dz ≥ 0. */
const REAL_STEMS: { label: string; d: Vec3; yawDeg: number; pitchDeg: number }[] = [
  { label: 'épisode 3 (tomate 3)', d: [-0.563, 0.298, 0.771], yawDeg: -27.9, pitchDeg: -39.6 },
  { label: 'épisode 4 (tomate 4)', d: [0.655, 0.546, 0.523], yawDeg: 39.8, pitchDeg: 58.5 },
  { label: 'épisode 5 (tomate 5)', d: [-0.451, 0.612, 0.65], yawDeg: -53.6, pitchDeg: -49.5 },
];

describe('bladeAnglesForStem', () => {
  it('leaves a vertical stem at yaw 0 / pitch 0 (default horizontal blade plane)', () => {
    expect(bladeAnglesForStem([0, 0, -1])).toEqual({ yawDeg: 0, pitchDeg: 0 });
    expect(bladeAnglesForStem([0, 0, 4])).toEqual({ yawDeg: 0, pitchDeg: 0 });
  });

  it('lays the blade normal on the stem direction for the real stems of 2026-09-18', () => {
    for (const s of REAL_STEMS) {
      const a = bladeAnglesForStem(s.d);
      expect(a, s.label).not.toBeNull();
      expect(a!.yawDeg, s.label).toBeCloseTo(s.yawDeg, 1);
      expect(a!.pitchDeg, s.label).toBeCloseTo(s.pitchDeg, 1);
    }
  });

  it('takes the yaw + 180 branch when the stem points into the -X -Y quadrant', () => {
    // d retournée vers le haut : (-0,58, -0,58, 0,58) → lacet brut -135°, hors de ±90°.
    // La pose retenue est donc (-135 + 180, -arccos(dz)) = (45, -54,74), lames vers -X.
    const a = bladeAnglesForStem([1, 1, -1])!;
    expect(a.yawDeg).toBeCloseTo(45, 6);
    expect(a.pitchDeg).toBeCloseTo(-54.7356, 3);
    expect(vectorsFromAngles(a.yawDeg, a.pitchDeg, 0).bladeAxis[0]).toBeLessThan(0);
    // Miroir en -Y : lacet brut +135°, donc la branche lacet - 180.
    const b = bladeAnglesForStem([1, -1, -1])!;
    expect(b.yawDeg).toBeCloseTo(-45, 6);
    expect(b.pitchDeg).toBeCloseTo(-54.7356, 3);
  });

  it('gives a blade normal parallel to the stem, blades pointing towards the plant', () => {
    const samples: Vec3[] = [[-0.563, 0.298, 0.771], [0.655, 0.546, 0.523], [-0.451, 0.612, 0.65], [1, 0, 0], [0, -3, -3], [-2, 5, -1], [1, 1, -1], [1, -1, -1]];
    for (const d of samples) {
      const a = bladeAnglesForStem(d)!;
      const { bladeAxis, bladeNormal } = vectorsFromAngles(a.yawDeg, a.pitchDeg, 0);
      const cos = Math.abs(vdot(bladeNormal, vnorm(d)));
      expect(cos, `normale // tige pour ${JSON.stringify(d)}`).toBeCloseTo(1, 6);
      expect(bladeAxis[0], `lames vers -X pour ${JSON.stringify(d)}`).toBeLessThanOrEqual(1e-9);
      expect(Math.abs(a.pitchDeg)).toBeLessThanOrEqual(90);
      expect(Math.abs(a.yawDeg)).toBeLessThanOrEqual(90);
    }
  });

  it('returns null for a degenerate direction', () => {
    expect(bladeAnglesForStem([0, 0, 0])).toBeNull();
  });
});

describe('suggestedScissorsText', () => {
  const payload = (targetTomatoId: number | null): ViewsPayload => ({
    simTimeS: 1, phase: 'detected', targetTomatoId,
    tomatoes: [{ id: 2, state: 'ripe', ripeness: 1, positionCm: [1, 2, 3], stem: { fromCm: [0, 0, 10], toCm: [-2, 0, 8] }, visibleIn: { top: 1, front: 1, side: 1 } }],
    scissors: world.scissors, basket: world.basket, cameras: world.cameras, limits: world.limits,
  });

  it('gives the absolute pose that lays the blade plane across the target stem', () => {
    expect(suggestedScissorsText(payload(2))).toBe('suggestedScissors for target stem #2 (rotate_scissors, mode absolute, roll 0): {"yawDeg":0,"pitchDeg":45}');
  });

  it('says nothing without a target or without its stem', () => {
    expect(suggestedScissorsText(payload(null))).toBeNull();
    expect(suggestedScissorsText(payload(7))).toBeNull();
  });
});
