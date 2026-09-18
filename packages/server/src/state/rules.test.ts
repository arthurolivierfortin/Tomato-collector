import { describe, expect, it } from 'vitest';
import { outcomeForPhase, phaseAfterLanding, phasesAfterToolResult, phasesToClose } from './rules';

describe('phasesAfterToolResult', () => {
  it('first movement tool moves detected → harvesting; camera and status do not', () => {
    expect(phasesAfterToolResult('detected', 'move_basket', true)).toEqual(['harvesting']);
    expect(phasesAfterToolResult('detected', 'move_camera', true)).toEqual([]);
    expect(phasesAfterToolResult('detected', 'get_views', true)).toEqual([]);
    expect(phasesAfterToolResult('harvesting', 'move_scissors', true)).toEqual([]);
  });

  it('a successful cut goes cutting then falling, even straight from detected', () => {
    expect(phasesAfterToolResult('harvesting', 'cut', true)).toEqual(['cutting', 'falling']);
    expect(phasesAfterToolResult('detected', 'cut', true)).toEqual(['harvesting', 'cutting', 'falling']);
    expect(phasesAfterToolResult('harvesting', 'cut', false)).toEqual([]);
  });
});

describe('phaseAfterLanding', () => {
  it('decides harvested or missed only while falling', () => {
    expect(phaseAfterLanding('falling', true)).toBe('harvested');
    expect(phaseAfterLanding('falling', false)).toBe('missed');
    expect(phaseAfterLanding('harvesting', true)).toBeNull();
  });
});

describe('outcomeForPhase and phasesToClose', () => {
  it('derive the outcome from the phase, never from the agent claim', () => {
    expect(outcomeForPhase('harvested')).toBe('harvested');
    expect(outcomeForPhase('missed')).toBe('missed');
    expect(outcomeForPhase('harvesting')).toBe('aborted');
  });

  it('close through aborted when unfinished, wait during falling, nothing when idle', () => {
    expect(phasesToClose('harvested')).toEqual(['idle']);
    expect(phasesToClose('cutting')).toEqual(['aborted', 'idle']);
    expect(phasesToClose('falling')).toBeNull();
    expect(phasesToClose('idle')).toBeNull();
  });
});
