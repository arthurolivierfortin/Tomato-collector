/**
 * Partie 2 « Un cycle complet » : une prise sans coupure, sous-titres discrets par phase, et la
 * capture du terminal incrustée en vignette dès le réveil.
 */
import type { PlanEntry } from '../lib/plan';
import { PIP } from './zones';

const CYCLE = 'cycle';

/** Partie 2 « Un cycle complet » : une prise sans coupure, sous-titres discrets par phase. */
export const part2: PlanEntry[] = [
  { card: { text: 'Part 2: one full cycle', durationS: 4, subtitle: 'From the ripening tomato to the agent report, without a single cut' } },
  { take: CYCLE, from: { marker: 'murissement', offsetS: -2 }, to: { marker: 'detection' }, caption: 'Ripening' },
  { take: CYCLE, from: { marker: 'detection' }, to: { marker: 'observation' }, caption: 'Detection, then the agent wakes up', pip: PIP.corner },
  { take: CYCLE, from: { marker: 'observation' }, to: { marker: 'positionnement' }, caption: 'Observation: the agent asks for the three views and reads the scene', pip: PIP.corner },
  { take: CYCLE, from: { marker: 'positionnement' }, to: { marker: 'coupe' }, caption: 'Positioning: basket under the tomato, scissors at the middle of the stem', pip: PIP.corner },
  { take: CYCLE, from: { marker: 'coupe' }, to: { marker: 'chute' }, caption: 'Cut', pip: PIP.corner },
  { take: CYCLE, from: { marker: 'chute' }, to: { marker: 'rapport' }, caption: 'The fall into the basket', pip: PIP.corner },
  { take: CYCLE, from: { marker: 'rapport' }, to: { marker: 'fin' }, caption: 'Report: the agent closes the episode and notes what it would do differently', pip: PIP.corner },
];

