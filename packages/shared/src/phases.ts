export const PHASES = [
  'idle', 'detected', 'harvesting', 'cutting', 'falling', 'harvested', 'missed', 'aborted',
] as const;
export type Phase = (typeof PHASES)[number];

export const PHASE_TRANSITIONS: Readonly<Record<Phase, readonly Phase[]>> = {
  idle: ['detected'],
  detected: ['harvesting', 'aborted'],
  harvesting: ['cutting', 'aborted'],
  cutting: ['falling', 'harvesting', 'aborted'],
  falling: ['harvested', 'missed'],
  harvested: ['idle'],
  missed: ['idle'],
  aborted: ['idle'],
};

export function canTransition(from: Phase, to: Phase): boolean {
  return PHASE_TRANSITIONS[from].includes(to);
}

export function transition(from: Phase, to: Phase): Phase {
  if (!canTransition(from, to)) {
    throw new Error(`Invalid phase transition ${from} -> ${to}`);
  }
  return to;
}
