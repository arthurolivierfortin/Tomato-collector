import { describe, expect, it } from 'vitest';
import { createDefaultWorld, type ViewsPayload } from '@tomato/shared';
import { IMAGE_PLACEHOLDER, formatToolArgs, formatToolResult, maskAndSummarize } from './traceJson';

const world = createDefaultWorld(1);
const PNG = `iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJ${'A'.repeat(400)}=`;

const payload: ViewsPayload = {
  simTimeS: 3.456,
  phase: 'harvesting',
  targetTomatoId: 3,
  tomatoes: [{ id: 3, state: 'ripe', ripeness: 1, positionCm: [17.34, -19.51, 38.3], stem: { fromCm: [17, -19, 44], toCm: [17, -19, 41] }, visibleIn: { top: 0.9, front: 0.8, side: 0.7 } }],
  scissors: world.scissors,
  basket: world.basket,
  cameras: world.cameras,
  limits: world.limits,
};

describe('formatToolArgs', () => {
  it('pretty-prints the arguments with two spaces and keeps an empty object visible', () => {
    expect(formatToolArgs({ x: 12, mode: 'absolute' })).toBe('{\n  "x": 12,\n  "mode": "absolute"\n}');
    expect(formatToolArgs({})).toBe('{}');
  });
});

describe('formatToolResult', () => {
  it('replaces every base64 image by a placeholder, wherever it sits', () => {
    const out = formatToolResult({ images: [{ camera: 'front', pngBase64: PNG, widthPx: 800, heightPx: 800 }] });
    expect(out).not.toContain('iVBORw0KGgo');
    expect(out).toContain(IMAGE_PLACEHOLDER);
    expect(formatToolResult(['Vue front', PNG])).toContain(IMAGE_PLACEHOLDER);
    expect(formatToolResult(PNG)).toBe(`"${IMAGE_PLACEHOLDER}"`);
  });

  it('summarizes a ViewsPayload down to the tomatoes and the tool poses', () => {
    const summary = maskAndSummarize(payload) as Record<string, unknown>;
    expect(Object.keys(summary)).toEqual(['simTimeS', 'phase', 'targetTomatoId', 'tomatoes', 'scissors', 'basket']);
    expect(summary.tomatoes).toEqual([{ id: 3, state: 'ripe', ripeness: 1, positionCm: [17.34, -19.51, 38.3], stem: { fromCm: [17, -19, 44], toCm: [17, -19, 41] } }]);
    expect(summary.scissors).toEqual(world.scissors);
    expect(formatToolResult(['Vue front — axes X→ Z↑', IMAGE_PLACEHOLDER, payload])).toContain('"targetTomatoId": 3');
  });

  it('rounds long decimals and returns an empty string when there is no result', () => {
    expect(formatToolResult({ a: 1.23456789 })).toContain('1.23');
    expect(formatToolResult(undefined)).toBe('');
    expect(formatToolResult('ok : moved')).toBe('"ok : moved"');
  });
});
