/**
 * Partie 2 « Un cycle complet » : une prise sans coupure, sous-titres discrets par phase, et la
 * capture du terminal incrustée en vignette dès le réveil.
 */
import type { PlanEntry } from '../lib/plan';
import { PIP, TOOL_CAM_CAPTION } from './zones';

const CYCLE = 'cycle';

/**
 * Temps laissé au sous-titre qui annonce l'incrustation de la caméra outil. Trois secondes : sous
 * `MIN_CAPTION_S` (2,5 s), le montage fondrait ce segment dans le suivant et les deux légendes
 * n'en feraient qu'une.
 */
const TOOL_CAM_INTRO_S = 3;

/** Partie 2 « Un cycle complet » : une prise sans coupure, sous-titres discrets par phase. */
export const part2: PlanEntry[] = [
  { card: { text: 'Part 2: one full cycle', durationS: 4, subtitle: 'From the ripening tomato to the agent report, without a single cut' } },
  { take: CYCLE, from: { marker: 'debut' }, to: { marker: 'detection' }, caption: 'Ripening' },
  { take: CYCLE, from: { marker: 'detection' }, to: { marker: 'observation' }, caption: 'Detection, then the agent wakes up', pip: PIP.corner },
  { take: CYCLE, from: { marker: 'observation' }, to: { marker: 'positionnement' }, caption: 'Observation: the agent asks for the three views and reads the scene', pip: PIP.corner },
  // Au premier `move_scissors`, deux choses arrivent ensemble : le pilote passe au cadrage coupe
  // (`k`) et l'incrustation de la caméra outil s'allume d'elle-même dans le coin bas droit. Trois
  // secondes de sous-titre pour la nommer, sans interrompre la prise, puis on n'en reparle plus.
  //
  // À partir d'ici et jusqu'à deux secondes après la chute, le sous-titre se range à gauche de
  // l'incrustation (`TOOL_CAM_CAPTION`) : de sa largeur habituelle, il passait juste dessus.
  {
    take: CYCLE,
    from: { marker: 'positionnement' },
    to: { marker: 'positionnement', offsetS: TOOL_CAM_INTRO_S },
    caption: 'Tool camera, bottom right',
    pip: PIP.corner,
    ...TOOL_CAM_CAPTION,
  },
  {
    take: CYCLE,
    from: { marker: 'positionnement', offsetS: TOOL_CAM_INTRO_S },
    to: { marker: 'coupe' },
    caption: 'Positioning: basket, then scissors on the stem',
    pip: PIP.corner,
    ...TOOL_CAM_CAPTION,
  },
  { take: CYCLE, from: { marker: 'coupe' }, to: { marker: 'chute' }, caption: 'Cut', pip: PIP.corner, ...TOOL_CAM_CAPTION },
  { take: CYCLE, from: { marker: 'chute' }, to: { marker: 'rapport' }, caption: 'The fall into the basket', pip: PIP.corner, ...TOOL_CAM_CAPTION },
  { take: CYCLE, from: { marker: 'rapport' }, to: { marker: 'fin' }, caption: 'Report: the agent closes the episode and notes what it would do differently', pip: PIP.corner },
];

