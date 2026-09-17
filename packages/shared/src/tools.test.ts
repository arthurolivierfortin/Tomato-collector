import { describe, expect, it } from 'vitest';
import { MAX_TOOL_CALLS_PER_EPISODE, TOOL_DESCRIPTIONS, TOOL_NAMES, ToolSchemas } from './tools';

describe('MCP tool schemas', () => {
  it('declares exactly the nine tools of the spec', () => {
    expect(TOOL_NAMES).toEqual([
      'get_status', 'get_views', 'move_camera', 'move_scissors', 'rotate_scissors',
      'open_scissors', 'cut', 'move_basket', 'report',
    ]);
    for (const name of TOOL_NAMES) {
      expect(TOOL_DESCRIPTIONS[name].length).toBeGreaterThan(40);
    }
    expect(MAX_TOOL_CALLS_PER_EPISODE).toBe(40);
  });

  it('validates move_scissors and rejects a missing mode', () => {
    expect(ToolSchemas.move_scissors.safeParse({ x: 1, y: 2, z: 3, mode: 'relative' }).success).toBe(true);
    expect(ToolSchemas.move_scissors.safeParse({ x: 1, y: 2, z: 3 }).success).toBe(false);
  });

  it('limits get_views to the three known cameras', () => {
    expect(ToolSchemas.get_views.safeParse({}).success).toBe(true);
    expect(ToolSchemas.get_views.safeParse({ cameras: ['top', 'side'] }).success).toBe(true);
    expect(ToolSchemas.get_views.safeParse({ cameras: ['back'] }).success).toBe(false);
  });

  it('requires an outcome and bounds the note of report', () => {
    expect(ToolSchemas.report.safeParse({ outcome: 'harvested', note: 'ok' }).success).toBe(true);
    expect(ToolSchemas.report.safeParse({ outcome: 'done', note: 'ok' }).success).toBe(false);
    expect(ToolSchemas.report.safeParse({ outcome: 'missed', note: 'x'.repeat(501) }).success).toBe(false);
  });
});
