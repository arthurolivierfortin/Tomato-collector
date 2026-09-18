/**
 * Partie 1 « Les concepts » : la prise en direct, avec l'agent réel, et la prise « pipeline » pour
 * le traitement des vues. Les textes gravés sont en anglais, sans tiret cadratin ni demi-cadratin ;
 * `demo.test.ts` le vérifie. Les zones citées sont dans `zones.ts`.
 */
import type { PlanEntry } from '../lib/plan';
import { pipelineSegments } from './pipeline';
import { PIP, ZONE } from './zones';

const CONCEPTS = 'concepts';

/** Partie 1 « Les concepts » : prise en direct, avec l'agent réel. */
export const part1: PlanEntry[] = [
  {
    card: {
      text: 'Tomato Collector',
      durationS: 4.5,
      subtitle: 'A Claude agent harvests tomatoes in a 3D simulation, using MCP tools and three annotated 2D views',
    },
  },
  {
    card: {
      text: 'Part 1: the concepts',
      durationS: 4,
      subtitle: 'The app, the plant, perception, the wake-up, the views, the tools, the cut',
    },
  },
  // (a) L'application.
  {
    take: CONCEPTS,
    from: { marker: 'app' },
    to: { marker: 'ripening_50' },
    caption: 'One page: the 3D simulation, the agent trace, and the views the agent receives',
    freezeAt: [
      {
        at: { marker: 'app', offsetS: 1.5 },
        durationS: 4.5,
        caption: 'Left: the scene and the robot. Middle: what the agent does. Right: what the agent sees.',
      },
    ],
  },
  // (b) Le plant et la tomate qui mûrit.
  {
    take: CONCEPTS,
    from: { marker: 'ripening_50' },
    to: { marker: 'detected' },
    title: { text: 'The plant and the ripening tomato', durationS: 3.5 },
    caption: 'One tomato ripens at a time; green to red takes 15 s of simulated time',
    freezeAt: [{ at: { marker: 'ripening_50' }, durationS: 4.5, caption: 'The status bar follows the tomato that is ripening', highlight: ZONE.ripening }],
  },
  // (c) La perception détecte.
  {
    take: CONCEPTS,
    from: { marker: 'detected' },
    to: { marker: 'wake_agent' },
    title: { text: 'Perception detects a ripe tomato', durationS: 3.5 },
    caption: 'Contours (Canny + CLAHE), then YOLOv8 (ONNX) or HSV colour thresholding',
    freezeAt: [
      {
        at: { marker: 'detected', offsetS: 0.5 },
        durationS: 4.5,
        caption: 'Ripe tomato spotted. The server is about to wake the agent.',
        highlight: ZONE.wakeBanner,
      },
    ],
  },
  // Panneau « Perception » (touche `p`) : présent seulement quand l'issue #36 est mergée.
  {
    take: CONCEPTS,
    optional: true,
    from: { marker: 'perception_panel' },
    to: { marker: 'perception_panel', offsetS: 3.8 },
    caption: 'What decides that a tomato is ripe',
    highlight: ZONE.perceptionPanel,
    freezeAt: [
      {
        at: { marker: 'perception_panel', offsetS: 1 },
        durationS: 4.5,
        caption: 'Ripeness is decided from the camera frames, not from simulation state',
      },
    ],
  },
  // (d) Le serveur réveille l'agent.
  {
    take: CONCEPTS,
    from: { marker: 'wake_agent' },
    to: { marker: 'views_first', offsetS: 1.5 },
    title: { text: 'The server wakes the agent', durationS: 3.5 },
    caption: 'The block diagram lights one arrow at a time: the agent does not exist until it is woken',
    highlight: ZONE.blockDiagram,
    freezeAt: [
      { at: { marker: 'wake_agent', offsetS: 0.4 }, durationS: 4, caption: 'Server to agent: wake up, tomato 1 is ripe' },
      { at: { marker: 'views_first', offsetS: 1 }, durationS: 4.5, caption: 'First tool call of the episode: get_views on all three cameras', highlight: ZONE.trace },
    ],
  },
  // L'agent est une vraie session Claude Code : le terminal prend la moitié droite de l'écran, au
  // moment même où le tout premier `tool_use` de la session s'y inscrit.
  {
    take: CONCEPTS,
    from: { marker: 'views_first', offsetS: 1.5 },
    to: { marker: 'lightbox_front', offsetS: -1.5 },
    title: { text: 'The agent is a real Claude Code session', durationS: 4.5, subtitle: 'The server console, live: init, text, tool_use, tool_result, result' },
    caption: 'On the right, the server console: the SDK stream as it arrives',
    pip: PIP.half,
    freezeAt: [
      {
        at: { marker: 'views_first', offsetS: 2.5 },
        durationS: 4.5,
        caption: 'The first tool_use of the session: get_views, and the tool_result that answers it',
      },
    ],
  },
  // (e) Les trois vues, à la loupe (plein écran : pas de cadre, tout est déjà montré).
  {
    take: CONCEPTS,
    from: { marker: 'lightbox_front', offsetS: -1.5 },
    to: { marker: 'gizmos', offsetS: -1.5 },
    title: {
      text: 'What the agent sees: three annotated orthographic views',
      durationS: 4.5,
      subtitle: 'Orthographic cameras: one centimetre is the same number of pixels at any depth',
    },
    caption: 'Centimetre grid, axes, scale bar, numbered markers, target stem, scissors and basket',
    freezeAt: [
      { at: { marker: 'lightbox_front', offsetS: 1 }, durationS: 4.5, caption: 'Front view. X to the right, Z up: the stem and the tomatoes.' },
      { at: { marker: 'lightbox_side', offsetS: 1 }, durationS: 4.5, caption: 'Side view. Y to the right, Z up: the scissors and their opening.' },
      { at: { marker: 'lightbox_top', offsetS: 1 }, durationS: 4.5, caption: 'Top view. X to the right, Y up: the basket and the fall point.' },
    ],
  },
  // Carton honnête : ce qui vient encore de la simulation dans les vues annotées.
  {
    card: {
      text: 'What is measured, and what is given',
      durationS: 5.5,
      subtitle:
        'Tomato markers and the target stem line come from the simulation. Edge extraction, ripeness detection, robot pose and basket come from real image processing and real robot state.',
    },
  },
  // Le traitement des vues, étape par étape (prise « pipeline », sans agent).
  ...pipelineSegments(),
  // D'où viennent les images : les gizmos des trois caméras.
  {
    take: CONCEPTS,
    from: { marker: 'gizmos', offsetS: -1.5 },
    to: { marker: 'rotate', offsetS: -0.8 },
    caption: 'The three orthogonal cameras in the scene (key c), where the views come from',
    freezeAt: [{ at: { marker: 'gizmos', offsetS: 1 }, durationS: 4, caption: 'Three orthogonal rails and a limited pivot. The agent moves them itself.' }],
  },
  // (f) Les outils MCP. Le marqueur `rotate` est posé quand le pilote revient à la trace, pas quand
  // l'agent appelle `rotate_scissors` : la ligne est déjà là depuis un moment et la trace a défilé.
  // Les légendes parlent donc de l'appel qui est à l'écran, quel qu'il soit, pas d'un outil précis.
  {
    take: CONCEPTS,
    from: { marker: 'rotate', offsetS: -0.8 },
    to: { marker: 'agent_view', offsetS: -1.6 },
    title: {
      text: 'MCP tools: every action is a JSON call',
      durationS: 3.5,
      subtitle: 'get_views, move_camera, move_basket, move_scissors, rotate_scissors, open_scissors, cut, get_status, report',
    },
    caption: 'Every call shows its arguments and its result, as JSON',
    highlight: ZONE.trace,
    freezeAt: [
      { at: { marker: 'rotate', offsetS: 0.8 }, durationS: 4.5, caption: 'One call, one line: the JSON sent, the JSON returned, and how long it took' },
      {
        at: { marker: 'rotate', offsetS: 2.6 },
        durationS: 4.5,
        caption: 'The raw session stream (key t): init, text, tool_use, tool_result, stderr',
        highlight: ZONE.rawSession,
      },
    ],
  },
  // Ce que l'agent reçoit vraiment.
  {
    take: CONCEPTS,
    from: { marker: 'agent_view', offsetS: -1 },
    to: { marker: 'agent_view', offsetS: 3.5 },
    // En mode « ce que voit l'agent », la colonne spectateur se réduit à 450 px et la grande vue
    // commence juste après : le bandeau se rétrécit d'autant pour ne rien recouvrir.
    captionWidth: 450,
    caption: 'Agent view (key v)',
    freezeAt: [{ at: { marker: 'agent_view', offsetS: 1 }, durationS: 4, caption: 'Three images and JSON. Nothing else.' }],
  },
  // (g) La coupe et la chute.
  {
    take: CONCEPTS,
    from: { marker: 'normal_view' },
    to: { marker: 'end' },
    title: { text: 'Cut, fall, basket', durationS: 3.5 },
    caption: 'The stem is cut, the tomato falls, a sensor in the basket confirms the harvest',
    highlight: ZONE.trace,
    freezeAt: [
      { at: { marker: 'cut', offsetS: 0.4 }, durationS: 4, caption: 'cut returns the distance to the middle of the stem and the blade angle' },
      { at: { marker: 'landed', offsetS: 0.6 }, durationS: 4.5, caption: 'The tomato lands in the basket: harvest confirmed' },
    ],
  },
];

