import { describe, expect, it } from 'vitest';
import { makeRgba } from './rgba';
import type { Detection } from './types';
import { decodeYolo, iou, labelFromName, letterbox, nms, parseModelMeta, unletterbox } from './yoloDecode';

describe('letterbox / unletterbox', () => {
  it('centres a 4×2 image in a 4×4 square with grey bands and CHW planes in 0..1', () => {
    const img = makeRgba(4, 2, [255, 0, 0]);
    const lb = letterbox(img, 4);
    expect(lb).toMatchObject({ size: 4, scale: 1, padX: 0, padY: 1 });
    expect(lb.tensor.length).toBe(3 * 16);
    expect(lb.tensor[0]).toBeCloseTo(114 / 255); // bande grise, canal R, ligne 0
    expect(lb.tensor[4]).toBe(1); // ligne 1, canal R = 255
    expect(lb.tensor[16 + 4]).toBe(0); // canal G
    expect(lb.tensor[32 + 4]).toBe(0); // canal B
    expect(lb.tensor[12]).toBeCloseTo(114 / 255); // bande grise, ligne 3
  });

  it('scales an 800 px square to 640 without padding and maps boxes back', () => {
    const lb = letterbox(makeRgba(800, 800), 640);
    expect(lb).toMatchObject({ scale: 0.8, padX: 0, padY: 0 });
    const back = unletterbox({ bbox: [80, 80, 160, 160], score: 0.9, label: 'ripe' }, lb);
    expect(back.bbox).toEqual([100, 100, 200, 200]);
  });

  it('removes the vertical padding when mapping back', () => {
    const lb = letterbox(makeRgba(4, 2), 4);
    expect(unletterbox({ bbox: [1, 1, 2, 1], score: 1, label: 'ripe' }, lb).bbox).toEqual([1, 0, 2, 1]);
  });
});

describe('labelFromName / parseModelMeta', () => {
  it('maps class names to ripe/unripe, unripe taking precedence', () => {
    expect(labelFromName('ripe')).toBe('ripe');
    expect(labelFromName('Ripe_Tomato')).toBe('ripe');
    expect(labelFromName('unripe')).toBe('unripe');
    expect(labelFromName('green')).toBe('unripe');
  });

  it('accepts { names: string[] } and rejects anything else', () => {
    expect(parseModelMeta({ names: ['unripe', 'ripe'], imgsz: 640 })).toEqual({ names: ['unripe', 'ripe'] });
    expect(parseModelMeta({ names: [] })).toBeNull();
    expect(parseModelMeta({ names: [1] })).toBeNull();
    expect(parseModelMeta('<!doctype html>')).toBeNull();
    expect(parseModelMeta(null)).toBeNull();
  });
});

/** Tenseur synthétique [1, 6, 5] : 5 ancres, colonnes cx, cy, w, h, score unripe, score ripe. */
function syntheticOutput(): { data: Float32Array; dims: number[] } {
  const anchors = [
    [100, 100, 50, 50, 0.05, 0.9], // ripe
    [104, 102, 50, 50, 0.1, 0.8], // doublon de la précédente (IoU élevé) → supprimé par NMS
    [300, 300, 40, 40, 0.7, 0.2], // unripe
    [500, 500, 30, 30, 0.1, 0.1], // sous le seuil
    [520, 200, 30, 30, 0.05, 0.5], // ripe isolée
  ];
  const n = anchors.length;
  const data = new Float32Array(6 * n);
  anchors.forEach((row, i) => row.forEach((v, c) => (data[c * n + i] = v)));
  return { data, dims: [1, 6, n] };
}

describe('decodeYolo + nms', () => {
  const labels = ['unripe', 'ripe'] as const;

  it('decodes cx/cy/w/h into x/y/w/h, picks the best class and drops low scores', () => {
    const { data, dims } = syntheticOutput();
    const raw = decodeYolo(data, dims, labels, 0.25);
    expect(raw).toHaveLength(4);
    expect(raw[0]).toEqual({ bbox: [75, 75, 50, 50], score: expect.closeTo(0.9, 5), label: 'ripe' });
    expect(raw[2]).toEqual({ bbox: [280, 280, 40, 40], score: expect.closeTo(0.7, 5), label: 'unripe' });
  });

  it('nms keeps three boxes sorted by score and removes the overlapping ripe duplicate', () => {
    const { data, dims } = syntheticOutput();
    const kept = nms(decodeYolo(data, dims, labels, 0.25), 0.45);
    expect(kept.map((d) => [d.label, Number(d.score.toFixed(1))])).toEqual([
      ['ripe', 0.9],
      ['unripe', 0.7],
      ['ripe', 0.5],
    ]);
  });

  it('returns nothing when dims or class count do not match', () => {
    const { data } = syntheticOutput();
    expect(decodeYolo(data, [1, 6, 5], ['ripe'], 0.25)).toEqual([]);
    expect(decodeYolo(data, [6, 5], labels, 0.25)).toEqual([]);
  });

  it('iou is 1 for identical boxes, 0 for disjoint ones, and nms does not merge across classes', () => {
    const a: Detection['bbox'] = [0, 0, 10, 10];
    expect(iou(a, a)).toBe(1);
    expect(iou(a, [20, 20, 5, 5])).toBe(0);
    expect(iou(a, [5, 0, 10, 10])).toBeCloseTo(1 / 3);
    const both: Detection[] = [
      { bbox: a, score: 0.9, label: 'ripe' },
      { bbox: a, score: 0.8, label: 'unripe' },
    ];
    expect(nms(both, 0.45)).toHaveLength(2);
  });
});
