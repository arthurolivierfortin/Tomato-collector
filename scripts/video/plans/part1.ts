/**
 * Partie 1 « Les concepts » : la prise en direct, avec l'agent réel, et la prise « pipeline » pour
 * le traitement des vues. Les textes gravés sont en anglais, sans tiret cadratin ni demi-cadratin ;
 * `demo.test.ts` le vérifie. Les zones citées sont dans `zones.ts`.
 */
import type { PlanEntry } from '../lib/plan';
import { detectionSegments } from './detection';
import { pipelineSegments } from './pipeline';
import { PIP, TOOL_CAM_CAPTION, ZONE } from './zones';

const CONCEPTS = 'concepts';

/**
 * Partie 1 « Les concepts » : prise en direct, avec l'agent réel.
 *
 * Le carton du titre n'est plus ici : c'est le carton de signature d'ouverture (`demo.ts`), qui dit
 * la même chose et porte en plus le nom de l'auteur. Deux cartons « Tomato Collector » de suite se
 * regardaient mal.
 */
export const part1: PlanEntry[] = [
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
  // (b) Le plant et la tomate qui mûrit. Le mûrissement s'arrête quatre secondes avant la détection :
  // la suite, c'est la prise « detection » qui la montre, du point de vue du modèle.
  {
    take: CONCEPTS,
    from: { marker: 'ripening_50' },
    to: { marker: 'detected', offsetS: -4 },
    title: { text: 'The plant and the ripening tomato', durationS: 3.5 },
    caption: 'One tomato ripens at a time; green to red takes 15 s of simulated time',
    freezeAt: [{ at: { marker: 'ripening_50' }, durationS: 4.5, caption: 'The status bar follows the tomato that is ripening', highlight: ZONE.ripening }],
  },
  // (c) La perception décide : prise « detection », filmée à part, agent coupé, donc gratuite. Elle
  // remplace le passage tiré de `concepts` (un bandeau qui s'allume) par ce que le modèle voit
  // vraiment, avant, pendant et après le mûrissement. Le réveil, lui, reste sur `concepts`.
  ...detectionSegments,
  // (d) Le serveur réveille l'agent. Le pilote ouvre le panneau « Perception » 36 ms après ce
  // marqueur : les trois segments qui suivent se relaient sans jamais remontrer les mêmes secondes.
  // La v2 les remontrait : le segment « Perception » jouait 22,2 → 26,0 s, puis le segment du réveil
  // rejouait 22,2 → 28,3 s, soit 3,8 s deux fois de suite (le juge de #34 l'avait demandé : aucune
  // seconde deux fois). Ils sont maintenant rangés dans l'ordre de la prise et découpés bout à bout.
  {
    take: CONCEPTS,
    from: { marker: 'wake_agent' },
    to: { marker: 'wake_agent', offsetS: 0.9 },
    title: {
      text: 'The server wakes the agent',
      durationS: 3.5,
      subtitle: 'The block diagram lights one arrow at a time, from perception to the agent',
    },
    highlight: ZONE.blockDiagram,
    // L'arrêt tombe à la fin du segment : le sous-plan vidéo le précède, rien ne le suit. Et la
    // seconde de vidéo n'a pas de sous-titre à elle : une phrase entière posée puis retirée en
    // moins d'une seconde ne se lit pas ; c'est le carton, puis l'arrêt sur image, qui parlent.
    freezeAt: [
      {
        at: { marker: 'wake_agent', offsetS: 0.9 },
        durationS: 4,
        caption: 'Server to agent: wake up, tomato 1 is ripe. The agent does not exist until it is woken.',
      },
    ],
  },
  // Panneau « Perception » (touche `p`) : présent seulement quand l'issue #36 est mergée. Reprend
  // la prise là où le segment du réveil l'a laissée, et la rend au segment suivant.
  {
    take: CONCEPTS,
    optional: true,
    from: { marker: 'perception_panel', offsetS: 0.9 },
    // Le panneau se referme quatre secondes après son ouverture, et le marqueur est posé une
    // demi-seconde après l'ouverture réelle (latence de scrutation du pilote) : l'arrêt sur image
    // reste donc à +2,6 s, avec de la marge des deux côtés. À +3,8 s le panneau était déjà replié.
    to: { marker: 'perception_panel', offsetS: 2.6 },
    caption: 'What decides that a tomato is ripe',
    highlight: ZONE.perceptionPanel,
    freezeAt: [
      {
        at: { marker: 'perception_panel', offsetS: 2.6 },
        durationS: 4.5,
        caption: 'Ripeness is decided from the camera frames, not from simulation state',
      },
    ],
  },
  // (e) Le premier appel d'outil de l'épisode, une fois le panneau refermé.
  {
    take: CONCEPTS,
    from: { marker: 'views_first', offsetS: -0.7 },
    to: { marker: 'views_first', offsetS: 1.5 },
    caption: 'The agent is awake and asks for its views',
    highlight: ZONE.trace,
    freezeAt: [
      { at: { marker: 'views_first', offsetS: 1.5 }, durationS: 4.5, caption: 'First tool call of the episode: get_views on all three cameras' },
    ],
  },
  // L'agent est un vrai Claude Code headless : la fenêtre où il tourne prend la moitié droite de
  // l'écran, au moment même où le tout premier `tool_use` de la session s'y inscrit. Ce qu'on y
  // voit est la sortie du binaire, `--output-format stream-json`, capturée à l'écran : rien n'est
  // reformaté par le montage (`--terminal window`, serveur `TOMATO_AGENT=visible`).
  {
    take: CONCEPTS,
    from: { marker: 'views_first', offsetS: 1.5 },
    to: { marker: 'lightbox_front', offsetS: -1.5 },
    title: {
      text: 'Claude Code, headless, live output',
      durationS: 4.5,
      subtitle: 'Screen capture of the terminal it runs in: init, assistant, tool_use, result',
    },
    caption: 'On the right, the real process: one JSON message per line, as it arrives',
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
  // (g) La vérification avant la coupe. L'agent ne coupe pas au jugé : une fois les lames au milieu
  // de la tige, il **redemande les vues** et lit le point de coupe dessus avant d'appeler `cut`.
  // C'est dans le journal de l'épisode filmé (2026-09-18T20-14-09-255Z-t1) : `move_scissors` au
  // point exact, puis « Let me verify the cut point sits on the cyan stem in the front and side
  // views before cutting », puis `get_views {"cameras":["front","side"]}`, puis `cut`. Deux caméras,
  // pas trois : le sous-titre le dit comme c'est.
  {
    take: CONCEPTS,
    from: { marker: 'agent_view', offsetS: 3.5 },
    to: { marker: 'normal_view' },
    title: {
      text: 'Before cutting, the agent checks',
      durationS: 4,
      subtitle: 'It asks for the views again and reads the cut point on the stem before it calls cut',
    },
    // Toujours en mode « ce que voit l'agent » : la colonne spectateur ne fait que 450 px.
    captionWidth: 450,
    caption: 'The agent asks for its views again',
    freezeAt: [
      {
        at: { marker: 'agent_view', offsetS: 4.9 },
        durationS: 4.5,
        caption: 'Before cutting, the agent asks for the front and side views again and checks that the blades sit on the stem',
        zoom: {
          source: ZONE.agentFrontView,
          input: 'the blades closed on the stem midpoint (12.3, -5.3, 61.5)',
          by: 'the agent, reading the two views it just asked for',
          output: 'magenta cut point on the cyan stem, blade normal along it. Only then does it cut.',
        },
      },
    ],
  },
  // (h) La coupe et la chute. Deux regards se relaient : la trace, où l'on lit d'un coup d'œil
  // toute la vérification, et l'incrustation de la caméra outil, où l'on voit enfin le geste.
  //
  // La vue spectateur est passée au cadrage coupe (`k`) depuis le positionnement fin, et la caméra
  // embarquée sur les ciseaux s'est allumée toute seule : elle occupe le coin bas droit de la
  // colonne, d'où le sous-titre rétréci (`TOOL_CAM_CAPTION`) sur tout ce segment. Le bandeau de
  // largeur normale s'arrêtait à x 802 et passait juste dessus.
  {
    take: CONCEPTS,
    from: { marker: 'normal_view' },
    to: { marker: 'end' },
    title: { text: 'Cut, fall, basket', durationS: 3.5 },
    caption: 'The stem is cut, the tomato falls into the basket',
    highlight: ZONE.trace,
    ...TOOL_CAM_CAPTION,
    freezeAt: [
      // Les lames autour de la tige, vues de la caméra outil : à 1,7 m, dans le plan large, elles
      // faisaient une quarantaine de pixels de tranche, souvent derrière une feuille.
      {
        at: { marker: 'normal_view', offsetS: 0.9 },
        durationS: 4,
        caption: 'The tool camera rides on the scissors: both blades around the stem, nothing else',
        zoom: {
          source: ZONE.toolCamera,
          input: 'the scissors pose the agent just set, seen from a camera bolted 17 cm behind the pivot',
          by: 'the simulation, rendering a second pass of the spectator layer into the inset',
          output: 'the open V of the blades, the stem between them, the ripe tomato under it',
        },
      },
      {
        at: { marker: 'normal_view', offsetS: 1.8 },
        durationS: 4.5,
        caption: 'In the trace: 0.1 cm from the stem midpoint, cutting',
      },
      // La coupe elle-même : les lames fermées sur la tige, et le fruit qui part.
      {
        at: { marker: 'cut', offsetS: 0.4 },
        durationS: 4,
        caption: 'Blades closed, stem severed, and the tomato starts to fall',
        zoom: {
          source: ZONE.toolCamera,
          input: 'the cut call, once the blades sat within 0.5 cm of the stem midpoint',
          by: 'the simulation: the stem constraint is released and physics takes over',
          output: 'the closed blades, the cut stem, and the fruit already leaving the frame',
        },
      },
      { at: { marker: 'cut', offsetS: 1 }, durationS: 4, caption: 'cut returns the distance to the stem and the blade angle' },
      { at: { marker: 'landed', offsetS: 1.6 }, durationS: 4.5, caption: 'The tomato lands in the basket: harvest confirmed' },
    ],
  },
];

