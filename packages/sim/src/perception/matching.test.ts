import { describe, expect, it } from 'vitest';
import type { Vec2, Vec3 } from '@tomato/shared';
import { matchDetections } from './matching';
import type { Detection } from './types';

/** Projection de test : X → px, Z → py (la profondeur Y est ignorée). */
const project = (p: Vec3): Vec2 => [p[0], p[2]];

const tomatoes = [
  { id: 1, positionCm: [100, 0, 100] as Vec3 },
  { id: 2, positionCm: [300, 0, 300] as Vec3 },
];

describe('matchDetections', () => {
  it('matches a box whose centre is near the projected tomato and ignores far boxes', () => {
    const dets: Detection[] = [
      { bbox: [84, 78, 40, 40], score: 0.8, label: 'ripe' }, // centre (104, 98) → tomate 1
      { bbox: [480, 480, 40, 40], score: 0.9, label: 'ripe' }, // loin de tout
    ];
    expect(matchDetections(dets, tomatoes, project)).toEqual([
      { tomatoId: 1, score: 0.8, distancePx: expect.closeTo(Math.hypot(4, 2), 5), detectionIndex: 0 },
    ]);
  });

  it('keeps the best score per tomato, sorts by score and points back at its box', () => {
    const dets: Detection[] = [
      { bbox: [280, 280, 40, 40], score: 0.5, label: 'ripe' },
      { bbox: [285, 282, 40, 40], score: 0.7, label: 'ripe' },
      { bbox: [80, 80, 40, 40], score: 0.6, label: 'ripe' },
    ];
    const m = matchDetections(dets, tomatoes, project);
    expect(m.map((x) => [x.tomatoId, x.score, x.detectionIndex])).toEqual([
      [2, 0.7, 1],
      [1, 0.6, 2],
    ]);
  });

  it('ignores unripe detections and returns nothing without tomatoes', () => {
    const dets: Detection[] = [{ bbox: [80, 80, 40, 40], score: 0.9, label: 'unripe' }];
    expect(matchDetections(dets, tomatoes, project)).toEqual([]);
    expect(matchDetections([{ bbox: [80, 80, 40, 40], score: 0.9, label: 'ripe' }], [], project)).toEqual([]);
  });

  it('uses the box size as the tolerance (small box, same offset → rejected)', () => {
    const dets: Detection[] = [{ bbox: [104, 98, 4, 4], score: 0.9, label: 'ripe' }]; // centre (106, 100), 6 px de la tomate 1, boîte de 4 px
    expect(matchDetections(dets, tomatoes, project)).toEqual([]);
  });
});
