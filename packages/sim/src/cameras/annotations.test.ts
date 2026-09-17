import { describe, expect, it } from 'vitest';
import { VIEW_SIZE_PX, createDefaultWorld, vlen, vsub, type CameraId, type ViewsPayload } from '@tomato/shared';
import { buildOverlay } from './annotations';
import { LABEL_MARGIN_PX, labelWidthPx } from './clampLabel';
import { gridSegments } from './gridLines';
import { HEADER_HEIGHT_PX } from './layerGrid';
import { MARKER_RADIUS_PX, OCCLUDED_LABEL } from './layerMarkers';
import { projectToPixel } from './ortho';
import { type OverlayCommand, type OverlayKind } from './overlayTypes';
import { PALETTE } from './palette';
import { toViewsPayload } from './payload';
import { BLADE_LENGTH_CM, scissorsPoints } from './scissorsGeometry';
import { testTomato } from './testTomato';

const world = createDefaultWorld(1);
const front = world.cameras.front;
const t1 = testTomato(1, [10, 0, 50], 'ripe');
const t2 = { ...testTomato(2, [-8, 5, 40], 'unripe'), visibleIn: { top: 1, front: 0.2, side: 0.9 } };
const payload: ViewsPayload = toViewsPayload({ ...world, simTimeS: 3.25, tomatoes: [t1, t2], targetTomatoId: 1 });
const cmds = buildOverlay('front', front, payload, 10);
const ofKind = <K extends OverlayKind>(list: OverlayCommand[], kind: K): Extract<OverlayCommand, { kind: K }>[] =>
  list.filter((c): c is Extract<OverlayCommand, { kind: K }> => c.kind === kind);
const texts = ofKind(cmds, 'text').map((c) => c.text);

describe('buildOverlay', () => {
  it('draws the grid lines, the axis labels and the scale bar (layer 2)', () => {
    expect(ofKind(cmds, 'line').length).toBeGreaterThanOrEqual(gridSegments('front', front, 10, front.widthCm).length);
    expect(texts).toContain('X →');
    expect(texts).toContain('Z ↑');
    expect(texts).toContain('20 cm');
    expect(texts).toContain('0');
    expect(texts).toContain('-40');
  });

  it('draws one numbered marker per tomato with its state colour and XYZ label (layer 3)', () => {
    const markers = ofKind(cmds, 'circle').filter((c) => c.radiusPx === MARKER_RADIUS_PX);
    expect(markers.length).toBe(2);
    expect(markers.map((m) => m.color)).toEqual([PALETTE.ripe, PALETTE.unripe]);
    expect(markers[0]!.center).toEqual(projectToPixel('front', front, t1.positionCm));
    expect(texts).toContain('#1 ripe (10.0, 0.0, 50.0)');
    expect(texts).toContain('#2 unripe (-8.0, 5.0, 40.0)');
  });

  it('badges a tomato hidden in this view (visibleIn < 0.5) and not in a view where it is visible', () => {
    expect(texts.some((s) => s.startsWith(OCCLUDED_LABEL))).toBe(true);
    const top = buildOverlay('top', world.cameras.top, payload, 10);
    expect(ofKind(top, 'text').some((c) => c.text.startsWith(OCCLUDED_LABEL))).toBe(false);
  });

  it('draws the target stem as a cyan line from stem.fromCm to stem.toCm (layer 4)', () => {
    const stem = ofKind(cmds, 'line').find((c) => c.color === PALETTE.stem);
    expect(stem).toBeDefined();
    expect(stem!.from).toEqual(projectToPixel('front', front, t1.stem.fromCm));
    expect(stem!.to).toEqual(projectToPixel('front', front, t1.stem.toCm));
  });

  it('draws the scissors schematic: pivot, two blades, cut cross, blade axis and normal in two colours, angles text', () => {
    const pts = scissorsPoints(world.scissors);
    const pivotPx = projectToPixel('front', front, pts.pivot);
    const blades = ofKind(cmds, 'line').filter((c) => c.color === PALETTE.bladeAxis && c.from[0] === pivotPx[0] && c.from[1] === pivotPx[1]);
    expect(blades.length).toBe(2);
    expect(ofKind(cmds, 'circle').some((c) => c.color === PALETTE.bladeAxis && c.fill === PALETTE.bladeAxis)).toBe(true);
    const cutPx = projectToPixel('front', front, world.scissors.cutPointCm);
    expect(ofKind(cmds, 'cross').some((c) => c.color === PALETTE.bladeAxis && c.center[0] === cutPx[0])).toBe(true);
    expect(ofKind(cmds, 'line').some((c) => c.color === PALETTE.bladeNormal)).toBe(true);
    expect(texts).toContain('lame');
    expect(texts).toContain('normale');
    expect(texts.some((s) => s.includes('lacet 0°') && s.includes('ouverture 0°'))).toBe(true);
  });

  it('draws the basket as projected floor and rim rectangles with a centre mark in yellow', () => {
    const polys = ofKind(cmds, 'polygon');
    expect(polys.length).toBe(2);
    expect(polys.every((p) => p.color === PALETTE.basket && p.points.length === 4)).toBe(true);
    const centrePx = projectToPixel('front', front, world.basket.centerCm);
    expect(ofKind(cmds, 'cross').some((c) => c.color === PALETTE.basket && c.center[1] === centrePx[1])).toBe(true);
  });

  it('draws the dashed fall line from the target straight down to the basket floor, with the impact point', () => {
    const fall = ofKind(cmds, 'dashedLine');
    expect(fall.length).toBe(1);
    const impact = projectToPixel('front', front, [10, 0, world.basket.centerCm[2]]);
    expect(fall[0]!.from).toEqual(projectToPixel('front', front, t1.positionCm));
    expect(fall[0]!.to[0]).toBeCloseTo(impact[0]);
    expect(fall[0]!.to[1]).toBeCloseTo(impact[1]);
    expect(texts).toContain('impact (10.0, 0.0)');
  });

  it('writes the header band: view name, axes, camera pose, px/cm, sim time (layer 5)', () => {
    const band = ofKind(cmds, 'rect').find((r) => r.from[0] === 0 && r.from[1] === 0);
    expect(band).toBeDefined();
    expect(band!.to).toEqual([800, HEADER_HEIGHT_PX]);
    expect(texts.some((s) => s.startsWith('VUE FRONT') && s.includes('X → droite, Z → haut') && s.includes('t = 3.3 s'))).toBe(true);
    expect(texts.some((s) => s.includes('caméra (0, -100, 45) cm') && s.includes('8.00 px/cm') && s.includes('grille 10 cm dans le plan y=0'))).toBe(true);
    expect(texts).not.toContain('PIVOTÉE');
    const pivoted = buildOverlay('front', { ...front, yawDeg: 10 }, payload, 10);
    expect(ofKind(pivoted, 'text').map((c) => c.text)).toContain('PIVOTÉE');
  });

  it('draws nothing target-specific without a target', () => {
    const none = buildOverlay('front', front, { ...payload, targetTomatoId: null }, 10);
    expect(ofKind(none, 'dashedLine').length).toBe(0);
    expect(ofKind(none, 'line').some((c) => c.color === PALETTE.stem)).toBe(false);
  });

  it('keeps every text at 13 px or more with a halo', () => {
    for (const t of ofKind(cmds, 'text')) {
      expect(t.sizePx).toBeGreaterThanOrEqual(13);
      expect(t.halo).toBe(true);
    }
  });
});

const CAM_IDS: CameraId[] = ['top', 'front', 'side'];

describe('buildOverlay label clamping', () => {
  for (const camId of CAM_IDS) {
    it(`keeps every text of the ${camId} view inside the 800×800 frame`, () => {
      const list = buildOverlay(camId, world.cameras[camId], payload, 10);
      const labels = ofKind(list, 'text');
      expect(labels.length).toBeGreaterThan(0);
      for (const t of labels) {
        const w = labelWidthPx(t.text, t.sizePx);
        const left = t.at[0] - (t.align === 'center' ? w / 2 : t.align === 'right' ? w : 0);
        expect(left).toBeGreaterThanOrEqual(LABEL_MARGIN_PX - 1e-6);
        expect(left + w).toBeLessThanOrEqual(VIEW_SIZE_PX - LABEL_MARGIN_PX + 1e-6);
        expect(t.at[1]).toBeGreaterThanOrEqual(LABEL_MARGIN_PX);
        expect(t.at[1]).toBeLessThanOrEqual(VIEW_SIZE_PX - LABEL_MARGIN_PX);
      }
    });
  }

  it('brings the scissors angles and normal labels back inside when the tool sits at the right edge', () => {
    for (const camId of CAM_IDS) {
      const labels = ofKind(buildOverlay(camId, world.cameras[camId], payload, 10), 'text');
      for (const needle of ['ciseaux lacet', 'normale', 'lame']) {
        const t = labels.find((c) => c.text.startsWith(needle));
        expect(t, `${needle} in ${camId}`).toBeDefined();
        expect(t!.at[0] + labelWidthPx(t!.text, t!.sizePx)).toBeLessThanOrEqual(VIEW_SIZE_PX - LABEL_MARGIN_PX + 1e-6);
      }
    }
  });
});

describe('scissorsPoints', () => {
  it('puts the pivot 3 cm behind the cut point and the tips 6 cm from the pivot, spread by the opening', () => {
    const closed = scissorsPoints(world.scissors); // axe [-1,0,0], normale [0,0,1], point de coupe [45,-35,60]
    expect(closed.pivot).toEqual([48, -35, 60]);
    expect(vlen(vsub(closed.tipA, closed.pivot))).toBeCloseTo(BLADE_LENGTH_CM);
    expect(vlen(vsub(closed.tipA, closed.tipB))).toBeCloseTo(0);
    const open = scissorsPoints({ ...world.scissors, openingDeg: 60 });
    expect(vlen(vsub(open.tipA, open.tipB))).toBeCloseTo(2 * BLADE_LENGTH_CM * Math.sin(Math.PI / 6));
    expect(open.tipA[2]).toBeCloseTo(60); // l'ouverture tourne autour de la normale : les pointes restent dans le plan des lames
    expect(closed.axisEnd).toEqual([37, -35, 60]);
    expect(closed.normalEnd).toEqual([45, -35, 68]);
  });
});
