/**
 * Plan de montage de la vidéo de démo, la traduction en données de `scripts/video/storyboard.md`.
 *
 * Les instants sont des marqueurs posés à l'enregistrement : refaire une prise ne demande pas de
 * retoucher le plan. **Tous les textes gravés dans l'image sont en anglais** (cartons, sous-titres,
 * cartons de fin) ; les libellés du dashboard, eux, restent ceux de l'application. Aucun tiret
 * long ni demi-cadratin : `noDashes` le vérifie dans `plans/demo.test.ts`.
 *
 * Aucun décalage ne remonte avant le marqueur précédent : les marqueurs sont posés dans l'ordre du
 * scénario, donc un segment qui va d'un marqueur au suivant ne peut ni s'inverser ni empiéter sur
 * le segment d'avant. C'est la règle qui garde le plan robuste quand un épisode est plus rapide ou
 * plus lent que celui sur lequel il a été réglé.
 */
import type { EndCardData } from '../lib/episodes';
import type { Rect } from '../lib/ffmpegFilters';
import type { MontagePlan, PlanEntry } from '../lib/plan';
import { PIPELINE_STAGES } from '../scenarios/pipeline';

const CONCEPTS = 'concepts';
const CYCLE = 'cycle';
const PIPELINE = 'pipeline';

/**
 * Zones du dashboard en 1920×1080, contrôles masqués (touche `h`), qu'un arrêt sur image peut
 * entourer d'un cadre. Le sous-titre, lui, reste toujours au même endroit : le bas de la colonne
 * spectateur, qui ne porte aucune information.
 */
const ZONE = {
  ripening: { x: 568, y: 4, w: 244, h: 36 },
  wakeBanner: { x: 8, y: 124, w: 786, h: 46 },
  blockDiagram: { x: 476, y: 980, w: 968, h: 96 },
  trace: { x: 800, y: 90, w: 484, h: 300 },
  rawSession: { x: 800, y: 526, w: 484, h: 272 },
  featuredView: { x: 1286, y: 116, w: 626, h: 636 },
} as const satisfies Record<string, Rect>;

/**
 * Incrustations de la capture du terminal. En partie 2 c'est une vignette dans le coin bas droit,
 * hors de la colonne spectateur et au-dessus du schéma bloc ; en partie 1, le segment qui montre
 * que l'agent est une vraie session Claude Code lui donne la moitié droite de l'écran.
 */
const PIP = {
  corner: { x: 1432, y: 620, w: 472, h: 300 },
  half: { x: 976, y: 168, w: 912, h: 744 },
} as const satisfies Record<string, Rect>;

/** Sept tuiles, sept arrêts sur image : ce qui entre, qui fait le travail, ce qui sort. */
const PIPELINE_CAPTIONS: readonly string[] = [
  'Raw camera frame, straight from the orthographic camera. No processing yet.',
  'CLAHE contrast (OpenCV, plain image processing): flattens the greenhouse lighting.',
  'Canny edge detection (OpenCV, plain image processing): leaves, stems and fruit as white contours.',
  'Ripeness detection. The work is done by a model: YOLOv8n in ONNX, or HSV colour thresholding when the model is not retained. Out: boxes and a confidence.',
  'Box to tomato matching (plain logic): each box is projected back onto the tomatoes of the scene.',
  'Annotations. Grid and scale come from the camera calibration, scissors and basket from the robot state, tomato markers and the stem line from the simulation, the fall line from physics.',
  'The final view, exactly as the agent receives it: one PNG per camera, plus a JSON block.',
];

/**
 * Cadre bleu posé sur la tuile de l'étape, dans l'écran `x`. **À recaler sur la première prise
 * `pipeline`** : la grille est celle que l'issue #36 annonce (quatre tuiles par rangée, deux
 * rangées), les pixels exacts ne seront connus qu'une fois l'écran à l'image. Ces segments sont
 * `optional` : rien n'est monté tant que la prise ne pose pas les marqueurs.
 */
function pipelineTile(i: number): Rect {
  const column = i % 4;
  const row = Math.floor(i / 4);
  return { x: 24 + column * 472, y: 150 + row * 440, w: 448, h: 416 };
}

/** Un arrêt sur image par tuile du traitement des vues ; segment facultatif tant que #36 n'est pas là. */
function pipelineSegments(): PlanEntry[] {
  return PIPELINE_STAGES.map((stage, i) => ({
    take: PIPELINE,
    optional: true,
    from: { marker: `pipeline_${i + 1}` },
    to: { marker: i + 1 === PIPELINE_STAGES.length ? 'end' : `pipeline_${i + 2}` },
    ...(i === 0
      ? { title: { text: 'From camera frame to what the agent sees', durationS: 3.5, subtitle: 'Seven stages. For each one: what goes in, what does the work, what comes out.' } }
      : {}),
    caption: `Stage ${i + 1} of 7: ${stage}`,
    freezeAt: [{ at: { marker: `pipeline_${i + 1}`, offsetS: 0.5 }, durationS: 4.5, caption: PIPELINE_CAPTIONS[i] ?? stage, highlight: pipelineTile(i) }],
  }));
}

/** Partie 1 « Les concepts » : prise en direct, avec l'agent réel. */
const part1: PlanEntry[] = [
  {
    card: {
      text: 'Tomato Collector',
      durationS: 4,
      subtitle: 'A Claude agent harvests tomatoes in a 3D simulation, using MCP tools and three annotated 2D views',
    },
  },
  {
    card: {
      text: 'Part 1: the concepts',
      durationS: 3.5,
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
        durationS: 3.5,
        caption: 'Left: the scene and the robot. Middle: what the agent does. Right: what the agent sees.',
      },
    ],
  },
  // (b) Le plant et la tomate qui mûrit.
  {
    take: CONCEPTS,
    from: { marker: 'ripening_50' },
    to: { marker: 'detected' },
    title: { text: 'The plant and the ripening tomato', durationS: 3 },
    caption: 'One tomato ripens at a time; green to red takes 15 s of simulated time',
    freezeAt: [{ at: { marker: 'ripening_50' }, durationS: 3.5, caption: 'The status bar follows the tomato that is ripening', highlight: ZONE.ripening }],
  },
  // (c) La perception détecte.
  {
    take: CONCEPTS,
    from: { marker: 'detected' },
    to: { marker: 'wake_agent' },
    title: { text: 'Perception detects a ripe tomato', durationS: 3 },
    caption: 'Contours (Canny + CLAHE), then YOLOv8 (ONNX) or HSV colour thresholding',
    freezeAt: [
      {
        at: { marker: 'detected', offsetS: 0.5 },
        durationS: 3.5,
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
    freezeAt: [
      {
        at: { marker: 'perception_panel', offsetS: 1 },
        durationS: 4,
        caption: 'Ripeness is decided from the camera frames, not from simulation state',
      },
    ],
  },
  // (d) Le serveur réveille l'agent.
  {
    take: CONCEPTS,
    from: { marker: 'wake_agent' },
    to: { marker: 'views_first', offsetS: 1.5 },
    title: { text: 'The server wakes the agent', durationS: 3 },
    caption: 'The block diagram lights one arrow at a time: the agent does not exist until it is woken',
    highlight: ZONE.blockDiagram,
    freezeAt: [
      { at: { marker: 'wake_agent', offsetS: 0.4 }, durationS: 3, caption: 'Server to agent: wake up, tomato 1 is ripe' },
      { at: { marker: 'views_first', offsetS: 1 }, durationS: 3.5, caption: 'First tool call of the episode: get_views on all three cameras', highlight: ZONE.trace },
    ],
  },
  // (e) Les trois vues, à la loupe (plein écran : pas de cadre, tout est déjà montré).
  {
    take: CONCEPTS,
    from: { marker: 'lightbox_front', offsetS: -1.5 },
    to: { marker: 'gizmos', offsetS: -1.5 },
    title: {
      text: 'What the agent sees: three annotated orthographic views',
      durationS: 3.5,
      subtitle: 'Orthographic cameras: one centimetre is the same number of pixels at any depth',
    },
    caption: 'Centimetre grid, axes, scale bar, numbered markers, target stem, scissors and basket',
    freezeAt: [
      { at: { marker: 'lightbox_front', offsetS: 1 }, durationS: 3.5, caption: 'Front view. X to the right, Z up: the stem and the tomatoes.' },
      { at: { marker: 'lightbox_side', offsetS: 1 }, durationS: 3.5, caption: 'Side view. Y to the right, Z up: the scissors and their opening.' },
      { at: { marker: 'lightbox_top', offsetS: 1 }, durationS: 3.5, caption: 'Top view. X to the right, Y up: the basket and the fall point.' },
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
    freezeAt: [{ at: { marker: 'gizmos', offsetS: 1 }, durationS: 3, caption: 'Three orthogonal rails and a limited pivot. The agent moves them itself.' }],
  },
  // (f) Les outils MCP.
  {
    take: CONCEPTS,
    from: { marker: 'rotate', offsetS: -0.8 },
    to: { marker: 'rotate', offsetS: 2 },
    title: {
      text: 'MCP tools: every action is a JSON call',
      durationS: 3,
      subtitle: 'get_views, move_camera, move_basket, move_scissors, rotate_scissors, open_scissors, cut, get_status, report',
    },
    caption: 'Every call shows its arguments and its result, as JSON',
    highlight: ZONE.trace,
    freezeAt: [
      { at: { marker: 'rotate', offsetS: 0.8 }, durationS: 3.5, caption: 'rotate_scissors: the blade angles suggested by the server, sent back as absolute values' },
      {
        at: { marker: 'rotate', offsetS: 1.7 },
        durationS: 3.5,
        caption: 'The raw session stream (key t): init, text, tool_use, tool_result, stderr',
        highlight: ZONE.rawSession,
      },
    ],
  },
  // L'agent est une vraie session Claude Code : le terminal prend la moitié de l'écran.
  {
    take: CONCEPTS,
    from: { marker: 'rotate', offsetS: 2 },
    to: { marker: 'agent_view', offsetS: -1.6 },
    title: { text: 'The agent is a real Claude Code session', durationS: 3.5, subtitle: 'Same stream, read from the server console: init, text, tool_use, tool_result, result' },
    caption: 'On the right, the server console: the SDK stream as it arrives',
    pip: PIP.half,
    freezeAt: [{ at: { marker: 'rotate', offsetS: 2.8 }, durationS: 4, caption: 'One tool_use line, its JSON arguments, and the tool_result that answers it' }],
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
    freezeAt: [{ at: { marker: 'agent_view', offsetS: 1 }, durationS: 3, caption: 'The agent gets these three images and some JSON. Nothing else.' }],
  },
  // (g) La coupe et la chute.
  {
    take: CONCEPTS,
    from: { marker: 'normal_view' },
    to: { marker: 'report', offsetS: 2 },
    title: { text: 'Cut, fall, basket', durationS: 3 },
    caption: 'The stem is cut, the tomato falls, a sensor in the basket confirms the harvest',
    highlight: ZONE.trace,
    freezeAt: [
      { at: { marker: 'cut', offsetS: 0.4 }, durationS: 3, caption: 'cut returns the distance to the middle of the stem and the blade angle' },
      { at: { marker: 'landed', offsetS: 0.6 }, durationS: 3.5, caption: 'The tomato lands in the basket: harvest confirmed' },
    ],
  },
];

/** Partie 2 « Un cycle complet » : une prise sans coupure, sous-titres discrets par phase. */
const part2: PlanEntry[] = [
  { card: { text: 'Part 2: one full cycle', durationS: 4, subtitle: 'From the ripening tomato to the agent report, without a single cut' } },
  { take: CYCLE, from: { marker: 'murissement', offsetS: -2 }, to: { marker: 'detection' }, caption: 'Ripening' },
  { take: CYCLE, from: { marker: 'detection' }, to: { marker: 'observation' }, caption: 'Detection, then the agent wakes up', pip: PIP.corner },
  { take: CYCLE, from: { marker: 'observation' }, to: { marker: 'positionnement' }, caption: 'Observation: the agent asks for the three views and reads the scene', pip: PIP.corner },
  { take: CYCLE, from: { marker: 'positionnement' }, to: { marker: 'coupe' }, caption: 'Positioning: basket under the tomato, scissors at the middle of the stem', pip: PIP.corner },
  { take: CYCLE, from: { marker: 'coupe' }, to: { marker: 'chute' }, caption: 'Cut', pip: PIP.corner },
  { take: CYCLE, from: { marker: 'chute' }, to: { marker: 'rapport' }, caption: 'The fall into the basket', pip: PIP.corner },
  { take: CYCLE, from: { marker: 'rapport' }, to: { marker: 'fin' }, caption: 'Report: the agent closes the episode and notes what it would do differently', pip: PIP.corner },
];

function endCards(end: EndCardData): PlanEntry[] {
  // Le coût n'apparaît que si le journal en porte un : mieux vaut ne rien dire que dire faux.
  const facts = [`${end.toolCalls} tool calls`, `${Math.round(end.durationS)} s`, ...(end.cost === null ? [] : [end.cost])];
  return [
    { card: { text: `Result: ${end.outcome}`, durationS: 4, subtitle: facts.join(' · ') } },
    {
      card: {
        text: 'An LLM can drive a robot',
        durationS: 4.5,
        subtitle: 'given tools it can call and images it can read like text',
      },
    },
  ];
}

export function demoPlan(end: EndCardData): MontagePlan {
  return { output: 'tomato-demo.mp4', width: 1920, height: 1080, fps: 30, segments: [...part1, ...part2, ...endCards(end)] };
}

/** Tous les textes que le montage grave dans l'image : cartons, sous-titres, arrêts sur image. */
export function burnedTexts(plan: MontagePlan): string[] {
  const out: string[] = [];
  for (const entry of plan.segments) {
    if ('card' in entry) {
      out.push(entry.card.text, ...(entry.card.subtitle === undefined ? [] : [entry.card.subtitle]));
      continue;
    }
    if (entry.title !== undefined) out.push(entry.title.text, ...(entry.title.subtitle === undefined ? [] : [entry.title.subtitle]));
    if (entry.caption !== undefined) out.push(entry.caption);
    for (const f of entry.freezeAt ?? []) out.push(f.caption);
  }
  return out;
}
