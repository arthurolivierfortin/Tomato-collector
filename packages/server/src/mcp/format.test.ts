import { createDefaultWorld, fail, ok } from '@tomato/shared';
import { describe, expect, it } from 'vitest';
import { actionResultText, compactJson, detailsText, fr, frVec, summarizeAction, viewHeader } from './format';

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
