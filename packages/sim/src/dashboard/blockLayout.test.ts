import { describe, expect, it } from 'vitest';
import { BLOCKS, BLOCK_W, DIAGRAM_W, blockCenterX, blockIndex, blockX, busSegment } from './blockLayout';

describe('blockLayout', () => {
  it('lists the five blocks of the spec in flow order', () => {
    expect(BLOCKS.map((b) => b.id)).toEqual(['simulation', 'perception', 'server', 'agent', 'dashboard']);
    expect(blockIndex('server')).toBe(2);
  });

  it('places the blocks left to right without overlap inside the viewBox', () => {
    let prevRight = 0;
    for (const b of BLOCKS) {
      const x = blockX(b.id);
      expect(x).toBeGreaterThan(prevRight);
      prevRight = x + BLOCK_W;
    }
    expect(prevRight).toBeLessThan(DIAGRAM_W);
    expect(blockCenterX('simulation')).toBeCloseTo(blockX('simulation') + BLOCK_W / 2);
  });

  it('orders the bus segment from left to right whatever the direction of the flow', () => {
    const ab = busSegment('server', 'agent');
    const ba = busSegment('agent', 'server');
    expect(ab).toEqual(ba);
    expect(ab.x1).toBeCloseTo(blockCenterX('server'));
    expect(ab.x2).toBeCloseTo(blockCenterX('agent'));
  });
});
