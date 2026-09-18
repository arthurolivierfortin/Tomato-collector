import { describe, expect, it } from 'vitest';
import { DEFAULT_CONSECUTIVE_FRAMES, createWakeGate } from './wakeGate';

describe('createWakeGate', () => {
  it('fires exactly on the n-th consecutive observation of the same id', () => {
    const g = createWakeGate(3);
    expect(g.push(1)).toBeNull();
    expect(g.push(1)).toBeNull();
    expect(g.push(1)).toBe(1);
    expect(g.push(1)).toBeNull(); // déjà signalé : pas de doublon
  });

  it('restarts the count when the id changes or disappears', () => {
    const g = createWakeGate(3);
    g.push(1);
    g.push(1);
    expect(g.push(null)).toBeNull();
    expect(g.push(1)).toBeNull();
    expect(g.push(1)).toBeNull();
    expect(g.push(2)).toBeNull();
    expect(g.push(2)).toBeNull();
    expect(g.push(2)).toBe(2);
  });

  it('defaults to 5 frames and reset() clears the count', () => {
    const g = createWakeGate();
    for (let i = 0; i < DEFAULT_CONSECUTIVE_FRAMES - 1; i++) expect(g.push(7)).toBeNull();
    g.reset();
    expect(g.push(7)).toBeNull();
    for (let i = 0; i < DEFAULT_CONSECUTIVE_FRAMES - 2; i++) expect(g.push(7)).toBeNull();
    expect(g.push(7)).toBe(7);
  });

  it('with n = 1 fires on the first observation', () => {
    expect(createWakeGate(1).push(3)).toBe(3);
  });
});
