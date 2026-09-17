import { describe, expect, it } from 'vitest';
import { fail, ok } from './actions';
import { createDefaultWorld } from './world';

describe('action results', () => {
  const state = createDefaultWorld(1);

  it('ok carries the message and the resulting state', () => {
    const r = ok(state, 'stem_cut');
    expect(r).toEqual({ ok: true, message: 'stem_cut', state });
  });

  it('fail carries a code, a message and optional numeric details', () => {
    const r = fail(state, 'misaligned', 'blade line is 20 deg from perpendicular', {
      distanceCm: 1.2,
      angleDeg: 20,
    });
    expect(r.ok).toBe(false);
    if (r.ok) throw new Error('unreachable');
    expect(r.error).toBe('misaligned');
    expect(r.details).toEqual({ distanceCm: 1.2, angleDeg: 20 });
  });
});
