import { describe, expect, it } from 'vitest';
import { PHASES, canTransition, transition } from './phases';

describe('phases', () => {
  it('lists the eight phases of the spec in order', () => {
    expect(PHASES).toEqual([
      'idle', 'detected', 'harvesting', 'cutting', 'falling', 'harvested', 'missed', 'aborted',
    ]);
  });

  it('follows the nominal harvest path', () => {
    let p = transition('idle', 'detected');
    p = transition(p, 'harvesting');
    p = transition(p, 'cutting');
    p = transition(p, 'falling');
    p = transition(p, 'harvested');
    expect(transition(p, 'idle')).toBe('idle');
  });

  it('lets a failed cut go back to harvesting', () => {
    expect(canTransition('cutting', 'harvesting')).toBe(true);
  });

  it('can abort from detected, harvesting and cutting but not from falling', () => {
    expect(canTransition('detected', 'aborted')).toBe(true);
    expect(canTransition('harvesting', 'aborted')).toBe(true);
    expect(canTransition('cutting', 'aborted')).toBe(true);
    expect(canTransition('falling', 'aborted')).toBe(false);
  });

  it('rejects skipping phases', () => {
    expect(canTransition('idle', 'cutting')).toBe(false);
    expect(() => transition('idle', 'cutting')).toThrow(/idle -> cutting/);
  });

  it('terminal phases only return to idle', () => {
    for (const p of ['harvested', 'missed', 'aborted'] as const) {
      expect(canTransition(p, 'idle')).toBe(true);
      expect(canTransition(p, 'detected')).toBe(false);
    }
  });
});
