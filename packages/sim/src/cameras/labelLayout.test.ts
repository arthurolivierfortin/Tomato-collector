import { describe, expect, it } from 'vitest';
import { LABEL_SIDE_GAP_PX, LABEL_STACK_GAP_PX, spreadLabelGroups, stackLabels, type LabelBox } from './labelLayout';
import { line, text, type OverlayCommand } from './overlayTypes';
import { FONT_PX } from './palette';

const box = (leftPx: number, topPx: number, widthPx = 100, heightPx = 16): LabelBox => ({ leftPx, topPx, widthPx, heightPx });

describe('stackLabels', () => {
  it('leaves labels that already stand apart where they are', () => {
    expect(stackLabels([box(10, 10), box(10, 100)], 800)).toEqual([10, 100]);
  });

  it('pushes a label that covers the previous one just below it', () => {
    const tops = stackLabels([box(10, 100), box(10, 104)], 800);
    expect(tops[0]).toBe(100);
    expect(tops[1]).toBe(100 + 16 + LABEL_STACK_GAP_PX);
  });

  it('leaves labels alone when their horizontal ranges do not meet', () => {
    expect(stackLabels([box(10, 100), box(400, 104)], 800)).toEqual([100, 104]);
  });

  it('separates two labels that would sit side by side without a readable gap', () => {
    const tops = stackLabels([box(10, 100, 100), box(110 + LABEL_SIDE_GAP_PX - 2, 100, 100)], 800);
    expect(tops[1]).toBeGreaterThan(100);
  });

  it('cascades: three labels on the same anchor end up stacked, none overlapping', () => {
    const tops = stackLabels([box(10, 100), box(10, 100), box(10, 100)], 800);
    expect(tops).toEqual([100, 119, 138]);
  });

  it('stacks by increasing top, whatever the input order, and answers in the input order', () => {
    const tops = stackLabels([box(10, 104), box(10, 100)], 800);
    expect(tops[1]).toBe(100); // la plus haute reste en place
    expect(tops[0]).toBe(100 + 16 + LABEL_STACK_GAP_PX); // la seconde descend sous elle
  });

  it('keeps every label inside the frame, even when the stack would overflow it', () => {
    const tops = stackLabels([box(10, 790), box(10, 790), box(10, 790)], 800);
    for (const top of tops) {
      expect(top).toBeGreaterThanOrEqual(0);
      expect(top + 16).toBeLessThanOrEqual(800);
    }
  });
});

const textAt = (y: number, value: string, group?: string): OverlayCommand => text([100, y], value, '#fff', FONT_PX, 'left', group);
const yOf = (cmds: OverlayCommand[], value: string): number => {
  const c = cmds.find((k) => k.kind === 'text' && k.text === value);
  if (c === undefined || c.kind !== 'text') throw new Error(`pas de texte ${value}`);
  return c.at[1];
};

describe('spreadLabelGroups', () => {
  it('moves a grouped label down when it covers another grouped label', () => {
    const out = spreadLabelGroups([textAt(200, 'aaaa', 'a'), textAt(203, 'bbbb', 'b')], 800);
    expect(yOf(out, 'aaaa')).toBe(200);
    expect(yOf(out, 'bbbb')).toBeGreaterThan(203 + FONT_PX);
  });

  it('leaves untagged labels (grille, bandeau) exactly where they are', () => {
    const out = spreadLabelGroups([textAt(200, 'aaaa'), textAt(203, 'bbbb')], 800);
    expect(yOf(out, 'aaaa')).toBe(200);
    expect(yOf(out, 'bbbb')).toBe(203);
  });

  it('carries the whole group — badge frame and leader end — by the same offset', () => {
    const rect: OverlayCommand = { kind: 'rect', from: [100, 205], to: [200, 223], color: '#f00', width: 1, group: 'b' };
    const lead: OverlayCommand = line([10, 203], [98, 203], '#f00', 1, 'b');
    const out = spreadLabelGroups([textAt(200, 'aaaa', 'a'), textAt(203, 'bbbb', 'b'), rect, lead], 800);
    const dy = yOf(out, 'bbbb') - 203;
    expect(dy).toBeGreaterThan(0);
    const movedRect = out.find((c) => c.kind === 'rect');
    expect(movedRect).toMatchObject({ from: [100, 205 + dy], to: [200, 223 + dy] });
    const movedLead = out.find((c) => c.kind === 'line');
    // L'amorce garde son ancre sur l'objet et ne suit que par son extrémité.
    expect(movedLead).toMatchObject({ from: [10, 203], to: [98, 203 + dy] });
  });

  it('pulls a group that overflows the right edge back inside, leader end included', () => {
    const wide = 'x'.repeat(90);
    const lead = line([700, 300], [780, 300], '#f00', 1, 'w');
    const out = spreadLabelGroups([text([780, 300], wide, '#fff', FONT_PX, 'left', 'w'), lead], 800);
    const moved = out.find((c) => c.kind === 'text');
    if (moved === undefined || moved.kind !== 'text') throw new Error('étiquette perdue');
    expect(moved.at[0]).toBeLessThan(780);
    const dx = moved.at[0] - 780;
    expect(out.find((c) => c.kind === 'line')).toMatchObject({ from: [700, 300], to: [780 + dx, 300] });
  });

  it('separates two labels that the right-edge clamp would have pushed onto each other', () => {
    const long = 'y'.repeat(80);
    const out = spreadLabelGroups([text([100, 300], long, '#fff', FONT_PX, 'left', 'a'), text([780, 302], long, '#fff', FONT_PX, 'left', 'b')], 800);
    const ys = out.filter((c) => c.kind === 'text').map((c) => (c.kind === 'text' ? c.at[1] : 0));
    expect(Math.abs(ys[0]! - ys[1]!)).toBeGreaterThan(FONT_PX);
  });

  it('keeps commands in their original order', () => {
    const out = spreadLabelGroups([textAt(200, 'aaaa', 'a'), textAt(203, 'bbbb', 'b')], 800);
    expect(out.map((c) => (c.kind === 'text' ? c.text : c.kind))).toEqual(['aaaa', 'bbbb']);
  });
});
