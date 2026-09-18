import { describe, expect, it } from 'vitest';
import { createDefaultWorld, VIEW_SIZE_PX, type Tomato, type Vec3 } from '@tomato/shared';
import { testTomato } from '../cameras/testTomato';
import { projectToPixel, pxPerCmOf } from '../cameras/ortho';
import { MIN_LABEL_VISIBILITY, labelsFor } from './datasetSample';

const world = createDefaultWorld(1);
const pose = world.cameras.front;
const POS: Vec3 = [10, 0, 50];

const seen = (t: Tomato, fraction: number): Tomato => ({ ...t, visibleIn: { top: fraction, front: fraction, side: fraction } });

describe('labelsFor', () => {
  it('projects each visible fruit onto a square box of 2 r and names its class', () => {
    const t = seen(testTomato(1, POS, 'ripe'), 1);
    const [label] = labelsFor('front', pose, [t]);
    const [cx, cy] = projectToPixel('front', pose, POS);
    const r = t.radiusCm * pxPerCmOf(pose);
    expect(label).toEqual({ tomatoId: 1, label: 'ripe', bbox: [cx - r, cy - r, 2 * r, 2 * r] });
  });

  it('counts turning as unripe, like the two classes of the model', () => {
    expect(labelsFor('front', pose, [seen(testTomato(2, POS, 'turning'), 1)])[0]?.label).toBe('unripe');
    expect(labelsFor('front', pose, [seen(testTomato(3, POS, 'unripe'), 1)])[0]?.label).toBe('unripe');
  });

  it('drops detached fruits and fruits hidden behind the foliage', () => {
    const hidden = seen(testTomato(4, POS, 'ripe'), MIN_LABEL_VISIBILITY - 0.01);
    const fallen = { ...seen(testTomato(5, POS, 'ripe'), 1), attached: false };
    expect(labelsFor('front', pose, [hidden, fallen])).toEqual([]);
  });

  it('crops the box to the frame and drops what becomes too small', () => {
    const far: Vec3 = [-200, 0, 50];
    expect(labelsFor('front', pose, [seen(testTomato(6, far, 'ripe'), 1)])).toEqual([]);
    const labels = labelsFor('front', pose, [seen(testTomato(7, POS, 'ripe'), 1)]);
    const [x, y, w, h] = labels[0]!.bbox;
    expect(x).toBeGreaterThanOrEqual(0);
    expect(y).toBeGreaterThanOrEqual(0);
    expect(x + w).toBeLessThanOrEqual(VIEW_SIZE_PX);
    expect(y + h).toBeLessThanOrEqual(VIEW_SIZE_PX);
  });

  it('scales the boxes when the image is smaller than the view', () => {
    const t = seen(testTomato(8, POS, 'ripe'), 1);
    const full = labelsFor('front', pose, [t], VIEW_SIZE_PX)[0]!.bbox;
    const half = labelsFor('front', pose, [t], VIEW_SIZE_PX / 2)[0]!.bbox;
    expect(half[2]).toBeCloseTo(full[2] / 2, 6);
    expect(half[0]).toBeCloseTo(full[0] / 2, 6);
  });
});
