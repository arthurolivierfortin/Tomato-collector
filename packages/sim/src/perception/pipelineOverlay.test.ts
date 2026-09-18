import { describe, expect, it } from 'vitest';
import type { Vec2 } from '@tomato/shared';
import { DETECTION_COLOR, detectionCommands, matchCommands } from './pipelineOverlay';
import type { Match } from './matching';
import type { Detection } from './types';

const ripe: Detection = { bbox: [100, 200, 40, 40], score: 0.87, label: 'ripe' };
const unripe: Detection = { bbox: [10, 4, 30, 30], score: 0.42, label: 'unripe' };

describe('detectionCommands', () => {
  it('draws one box per detection with its class and confidence', () => {
    const cmds = detectionCommands([ripe, unripe]);
    expect(cmds).toHaveLength(4);
    expect(cmds[0]).toMatchObject({ kind: 'rect', from: [100, 200], to: [140, 240], color: DETECTION_COLOR.ripe });
    expect(cmds[1]).toMatchObject({ kind: 'text', text: 'ripe 0.87', color: DETECTION_COLOR.ripe });
    expect(cmds[3]).toMatchObject({ kind: 'text', text: 'unripe 0.42', color: DETECTION_COLOR.unripe });
  });

  it('puts the label under a box that touches the top edge', () => {
    const [, above] = detectionCommands([ripe]);
    const [, below] = detectionCommands([unripe]);
    expect(above).toMatchObject({ at: [100, 195] });
    expect(below).toMatchObject({ at: [10, 47] }); // 4 + 30 + 13
  });

  it('draws nothing without detections', () => {
    expect(detectionCommands([])).toEqual([]);
  });
});

describe('matchCommands', () => {
  const projected = new Map<number, Vec2>([[3, [118, 222]]]);
  const match: Match = { tomatoId: 3, score: 0.87, distancePx: 3.6, detectionIndex: 0 };

  it('links the box to the projected centre and names the identifier it was given', () => {
    const cmds = matchCommands([ripe], [match], projected);
    expect(cmds.map((c) => c.kind)).toEqual(['rect', 'cross', 'line', 'text']);
    expect(cmds[1]).toMatchObject({ center: [118, 222] });
    expect(cmds[2]).toMatchObject({ from: [120, 220], to: [118, 222] });
    expect(cmds[3]).toMatchObject({ text: '#3 · 4 px' });
  });

  it('skips a match whose box or projected centre is missing', () => {
    expect(matchCommands([ripe], [{ ...match, detectionIndex: 9 }], projected)).toEqual([]);
    expect(matchCommands([ripe], [match], new Map())).toEqual([]);
  });
});
