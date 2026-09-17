import { describe, expect, it } from 'vitest';
import { VIEW_SIZE_PX } from '@tomato/shared';
import { LABEL_MARGIN_PX, clampCommands, clampLabel, labelWidthPx } from './clampLabel';
import { text, type OverlayCommand } from './overlayTypes';
import { FONT_PX } from './palette';

const SIZE = VIEW_SIZE_PX;
const ANGLES = 'ciseaux lacet 0° tangage 0° roulis 0° ouverture 0°';

describe('labelWidthPx', () => {
  it('estimates ~7.5 px per character at 13 px, halo included', () => {
    expect(labelWidthPx('abcdefghij', 13)).toBeGreaterThanOrEqual(75);
    expect(labelWidthPx('abcdefghij', 13)).toBeLessThanOrEqual(85);
    expect(labelWidthPx('abcde', 26)).toBeCloseTo(labelWidthPx('abcdefghij', 13), 5);
  });
});

describe('clampLabel', () => {
  it('leaves a label already inside the frame untouched', () => {
    expect(clampLabel(200, 400, 'normale', FONT_PX, SIZE)).toEqual([200, 400]);
    expect(clampLabel(100, 300, ANGLES, FONT_PX, SIZE)).toEqual([100, 300]);
  });

  it('moves a label anchored near the right edge left so its whole width fits', () => {
    const [x, y] = clampLabel(770, 280, ANGLES, FONT_PX, SIZE);
    expect(y).toBe(280);
    expect(x).toBeLessThan(770);
    expect(x).toBeGreaterThanOrEqual(LABEL_MARGIN_PX);
    expect(x + labelWidthPx(ANGLES, FONT_PX)).toBeLessThanOrEqual(SIZE - LABEL_MARGIN_PX);
  });

  it('moves a label anchored below the bottom edge up so its baseline and descender fit', () => {
    const [x, y] = clampLabel(100, 799, 'normale', FONT_PX, SIZE);
    expect(x).toBe(100);
    expect(y).toBeLessThan(799);
    expect(y).toBeLessThanOrEqual(SIZE - LABEL_MARGIN_PX);
    expect(y).toBeGreaterThan(SIZE - LABEL_MARGIN_PX - FONT_PX);
  });

  it('pulls a label out of the bottom-right corner on both axes at once', () => {
    const [x, y] = clampLabel(795, 810, ANGLES, FONT_PX, SIZE);
    expect(x + labelWidthPx(ANGLES, FONT_PX)).toBeLessThanOrEqual(SIZE - LABEL_MARGIN_PX);
    expect(y).toBeLessThanOrEqual(SIZE - LABEL_MARGIN_PX);
    expect(x).toBeGreaterThanOrEqual(LABEL_MARGIN_PX);
    expect(y).toBeGreaterThanOrEqual(LABEL_MARGIN_PX);
  });

  it('pushes a label off the left or top edge back inside', () => {
    expect(clampLabel(-50, 400, 'lame', FONT_PX, SIZE)[0]).toBeGreaterThanOrEqual(LABEL_MARGIN_PX);
    expect(clampLabel(100, 2, 'lame', FONT_PX, SIZE)[1]).toBeGreaterThanOrEqual(LABEL_MARGIN_PX + FONT_PX * 0.5);
  });

  it('falls back to the left margin for a label wider than the canvas', () => {
    expect(clampLabel(700, 400, 'x'.repeat(400), FONT_PX, SIZE)[0]).toBe(LABEL_MARGIN_PX);
  });
});

describe('clampCommands', () => {
  it('clamps every text command and leaves the other commands identical', () => {
    const cmds: OverlayCommand[] = [
      { kind: 'line', from: [790, 10], to: [900, 900], color: '#fff', width: 1 },
      text([780, 790], ANGLES, '#fff'),
    ];
    const out = clampCommands(cmds, SIZE);
    expect(out[0]).toEqual(cmds[0]);
    const t = out[1] as Extract<OverlayCommand, { kind: 'text' }>;
    expect(t.at[0] + labelWidthPx(ANGLES, FONT_PX)).toBeLessThanOrEqual(SIZE - LABEL_MARGIN_PX);
    expect(t.text).toBe(ANGLES);
  });

  it('keeps right-aligned and centred anchors aligned while fitting the text inside', () => {
    const right = clampCommands([text([SIZE - 2, 792], 'X →', '#fff', FONT_PX, 'right')], SIZE)[0] as Extract<
      OverlayCommand,
      { kind: 'text' }
    >;
    expect(right.align).toBe('right');
    expect(right.at[0]).toBeLessThanOrEqual(SIZE - LABEL_MARGIN_PX);
    expect(right.at[0] - labelWidthPx('X →', FONT_PX)).toBeGreaterThanOrEqual(LABEL_MARGIN_PX);

    const centred = clampCommands([text([SIZE - 4, 400], 'occultée 20 %', '#fff', FONT_PX, 'center')], SIZE)[0] as Extract<
      OverlayCommand,
      { kind: 'text' }
    >;
    const half = labelWidthPx('occultée 20 %', FONT_PX) / 2;
    expect(centred.align).toBe('center');
    expect(centred.at[0] + half).toBeLessThanOrEqual(SIZE - LABEL_MARGIN_PX);
    expect(centred.at[0] - half).toBeGreaterThanOrEqual(LABEL_MARGIN_PX);
  });
});
