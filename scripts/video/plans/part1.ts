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
  // (e) Le premier appel d'outil de l'épisode, une fois le panneau refermé. Le segment part du
  // marqueur lui-même, et pas 0,7 s avant : le marqueur est posé quand la trace affiche « Vues
  // demandées », et une légende qui annonce l'appel avant que la ligne existe décrit un événement
  // qui n'a pas encore eu lieu. La légende unique est celle de l'arrêt sur image, qui dure 4,5 s.
  {
    take: CONCEPTS,
    from: { marker: 'views_first' },
    to: { marker: 'views_first', offsetS: 0.4 },
    highlight: ZONE.trace,
    freezeAt: [
      {
        at: { marker: 'views_first', offsetS: 0.4 },
        durationS: 4.5,
        caption: 'The agent is awake: first tool call of the episode, get_views on all three cameras',
      },
    ],
  },
  // L'agent est un vrai Claude Code headless : la fenêtre où il tourne prend la moitié droite de
  // l'écran, au moment même où le tout premier `tool_use` de la session s'y inscrit. Ce qu'on y
  // voit est la sortie du binaire, `--output-format stream-json`, capturée à l'écran : rien n'est
  // reformaté par le montage (`--terminal window`, serveur `TOMATO_AGENT=visible`).
  //
  // **Deux arrêts sur image, et c'est une correction.** La v3 n'en avait qu'un, à
  // `views_first + 2,5 s`, et il tombait sur huit lignes de base64 : le `tool_result` d'un
  // `get_views` porte trois PNG de 800 × 800, et le flux les écrit en base64 sur la même ligne JSON.
  // Mesuré image par image sur `concepts.terminal.mp4` : la ligne `tool_use` de `get_views` est à
  // l'écran de 9,6 s à 11,0 s de la capture, le base64 défile entre 11,0 s et 11,2 s, et de 11,2 s à
  // 16,4 s l'écran porte le `tool_result` en JSON — tomates, ciseaux, panier, `suggestedScissors` —
  // sous les dernières lignes de base64. Il n'existe aucun instant où les deux sont ensemble ; le
  // montage s'arrête donc sur l'un, puis sur l'autre, et le dit.
  {
    take: CONCEPTS,
    from: { marker: 'views_first', offsetS: 0.4 },
    to: { marker: 'lightbox_front', offsetS: -1.2 },
    title: {
      text: 'Claude Code, headless, live output',
      durationS: 4.5,
      subtitle: 'Screen capture of the terminal it runs in: init, assistant, tool_use, tool_result, result',
    },
    caption: 'On the right, the real process: one JSON message per line, as it arrives',
    pip: PIP.half,
    freezeAt: [
      {
        // Capture à 10,2 s : le message `assistant`, puis la ligne
        // `"type":"tool_use" … "name":"mcp__robot__get_views"`. Aucun base64 à l'écran.
        at: { marker: 'views_first', offsetS: 0.7 },
        durationS: 4.5,
        caption: 'The first tool_use of the session (get_views), raw stream-json',
      },
      {
        // Capture à 15,5 s : cinq lignes de base64 en haut, et tout le reste est le `tool_result`.
        at: { marker: 'lightbox_front', offsetS: -1.4 },
        durationS: 4.5,
        caption: 'Its tool_result: the scene as JSON. Image payloads are base64 and scroll by as noise.',
      },
    ],
  },
  // (e) Les trois vues, à la loupe (plein écran : pas de cadre, tout est déjà montré).
  {
    take: CONCEPTS,
    from: { marker: 'lightbox_front', offsetS: -1.2 },
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
  // D'où viennent les images : les gizmos des trois caméras. Le segment part 0,8 s avant le
  // marqueur et non 1,5 s : le pilote presse `c` puis attend 0,9 s avant de poser le marqueur, donc
  // à -1,5 s les gizmos ne sont pas encore à l'écran et la légende parlait d'eux au futur.
  {
    take: CONCEPTS,
    from: { marker: 'gizmos', offsetS: -0.8 },
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
  // Ce que l'agent reçoit vraiment. Le mode dure de `agent_view` - 1,2 s à `agent_view` + 6,1 s
  // (le pilote presse `v`, attend 1,2 s, pose le marqueur, tient 6 s, puis represse `v`) : le
  // segment le suit jusqu'au bout, et c'est lui qui porte l'agrandissement de la vue `front`.
  {
    take: CONCEPTS,
    from: { marker: 'agent_view', offsetS: -1 },
    to: { marker: 'agent_view', offsetS: 6.3 },
    // En mode « ce que voit l'agent », la colonne spectateur se réduit à 450 px et la grande vue
    // commence juste après : le bandeau se rétrécit d'autant pour ne rien recouvrir.
    captionWidth: 450,
    caption: 'Agent view (key v)',
    freezeAt: [
      { at: { marker: 'agent_view', offsetS: 1 }, durationS: 4, caption: 'Three images and JSON. Nothing else.' },
      // L'agrandissement de la vue `front` **telle qu'elle est à cet instant**, et c'est une
      // correction. La v3 gravait « the blades closed on the stem midpoint (12.3, -5.3, 61.5) » et
      // « magenta cut point on the cyan stem » : relevé sur la prise du 2026-09-18, faux sur celle
      // du 2026-09-21. À 70,1 s, l'en-tête de la vue dit « t = 29,8 s, phase detected » — ce sont
      // les images du tout premier `get_views`, les seules que l'agent ait —, les ciseaux magenta
      // sont à une vingtaine de centimètres à droite de la tige, et la trace montrera une seconde
      // plus tard que l'agent est à 4,7 cm du milieu de la tige. C'est ça qu'il faut dire : l'agent
      // travaille sur les dernières images qu'il a demandées, jusqu'à ce qu'il en redemande.
      {
        at: { marker: 'agent_view', offsetS: 4.9 },
        durationS: 4.5,
        caption: 'The front view the agent works from, until it asks for a fresh one',
        zoom: {
          source: ZONE.agentFrontView,
          input: 'the views from the first get_views of the episode, header t = 29.8 s, phase detected',
          by: 'the simulation, rendering an orthographic camera and annotating it for the agent',
          output: 'numbered tomatoes, the cyan target stem, the magenta blades and their normal, the basket and the fall point',
        },
      },
    ],
  },
  // (g) La vérification avant la coupe. L'agent ne coupe pas au jugé : avant la dernière approche,
  // il **redemande les vues** et lit le point de coupe dessus avant d'appeler `cut`. Sur la prise du
  // 2026-09-21 : « 4.7 cm from the stem midpoint. Let me check the front and side views before the
  // last approach. », puis `get_views {"cameras":["front","side"]}`, puis l'ouverture des lames,
  // deux approches courtes et `cut`. Deux caméras, pas trois : le sous-titre le dit comme c'est.
  //
  // Le segment ne commence **pas** avant `agent_view` + 6,3 s, et c'est une correction : la trace
  // n'est pas à l'écran tant que le mode « ce que voit l'agent » est allumé, et la ligne « Vues
  // demandées : front, side » n'y a été relevée qu'à 71,5 s. Un segment parti plus tôt annonçait une
  // demande que rien ne montrait encore. Il n'a pas de sous-titre à lui : une phrase posée puis
  // retirée en une seconde ne se lit pas, c'est le carton puis l'arrêt sur image qui parlent.
  {
    take: CONCEPTS,
    from: { marker: 'agent_view', offsetS: 6.3 },
    to: { marker: 'normal_view' },
    title: {
      text: 'Before cutting, the agent checks',
      durationS: 4,
      subtitle: 'It asks for the front and side views again and reads the cut point on the stem before it calls cut',
    },
    highlight: ZONE.trace,
    // De retour en vue spectateur, l'incrustation de la caméra outil est allumée : bandeau rétréci.
    ...TOOL_CAM_CAPTION,
    freezeAt: [
      {
        at: { marker: 'normal_view' },
        durationS: 4.5,
        caption: 'Views requested again: front and side, read before the cut',
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
  //
  // **Trois entrées et non une, et c'est la correction principale de la v3.1.** La v3 tenait
  // `normal_view` → `end` en un seul segment, sous-titré « The stem is cut, the tomato falls into
  // the basket » — posé à 72,5 s pour une coupe à 100,4 s. Vingt-six secondes de texte qui annonce
  // ce qui n'est pas encore arrivé, parce que le plan avait été réglé sur un épisode où l'agent
  // coupait deux secondes après le retour en vue spectateur. Le découpage suit maintenant les
  // marqueurs de la prise : l'approche jusqu'à `cut`, la coupe et la chute jusqu'à `report`, le
  // rapport jusqu'à `end`. Aucune de ces bornes n'est un chiffre : elles tiennent quelle que soit
  // la vitesse de l'épisode.
  {
    take: CONCEPTS,
    from: { marker: 'normal_view' },
    to: { marker: 'cut' },
    title: {
      text: 'The last approach',
      durationS: 3.5,
      subtitle: 'The blades open, then a few short steps until the cut point sits on the stem midpoint',
    },
    caption: 'The agent closes the last centimetres, step by step',
    highlight: ZONE.trace,
    ...TOOL_CAM_CAPTION,
    freezeAt: [
      // Les lames vues de la caméra outil : à 1,7 m, dans le plan large, elles faisaient une
      // quarantaine de pixels de tranche, souvent derrière une feuille.
      //
      // La légende ne dit plus « both blades around the stem » ni « the open V of the blades » : à
      // `normal_view + 0,9 s` les lames sont **fermées** et à 4,7 cm du milieu de la tige (relevé
      // sur l'image, et la trace le confirme quatorze secondes plus tard, « Ciseaux ouverts (60°) »).
      // L'ouverture, sur cette prise, arrive à 84 s.
      {
        at: { marker: 'normal_view', offsetS: 0.9 },
        durationS: 4,
        caption: 'The tool camera rides on the scissors: the blades, the target stem, the ripe tomato',
        zoom: {
          source: ZONE.toolCamera,
          input: 'the scissors pose the agent just set, seen from a camera bolted 17 cm behind the pivot',
          by: 'the simulation, rendering a second pass of the spectator layer into the inset',
          output: 'the closed blades, the stem they are aiming at, and the ripe tomato hanging under it',
        },
      },
      // La légende ne cite **aucun chiffre de la trace**, et c'est une correction gardée de la v3.
      // Ce que la trace montre à `normal_view + 1,8 s` dépend entièrement de la vitesse de
      // l'épisode. Même règle que le segment `rotate` (README, « Marqueurs ») : la légende parle de
      // l'appel qui est à l'écran, quel qu'il soit.
      {
        at: { marker: 'normal_view', offsetS: 1.8 },
        durationS: 4.5,
        caption: 'The trace follows every call, as the agent makes it',
      },
    ],
  },
  // (h) La coupe et la chute. Le sous-titre est posé sur le marqueur `cut` : c'est là que la trace
  // affiche « Coupe », donc là que la phrase devient vraie.
  {
    take: CONCEPTS,
    from: { marker: 'cut' },
    to: { marker: 'report' },
    title: { text: 'Cut, fall, basket', durationS: 3.5 },
    caption: 'The stem is cut, the tomato falls into the basket',
    highlight: ZONE.trace,
    ...TOOL_CAM_CAPTION,
    freezeAt: [
      // La coupe elle-même. `cut + 0,1 s` et non `+ 0,4 s` : mesuré image par image **dans le
      // rectangle agrandi** (`ZONE.toolCamera`, 240 x 180 px), le fruit est encore accroché à
      // 100,36 s, détaché et à mi-hauteur à 100,48 s, et sorti du cadre à 100,52 s. À `+ 0,4 s` il
      // n'était plus là depuis longtemps et la légende parlait d'une chute qu'on ne voyait pas.
      {
        at: { marker: 'cut', offsetS: 0.1 },
        durationS: 4,
        caption: 'Blades closed, stem severed, and the tomato starts to fall',
        zoom: {
          source: ZONE.toolCamera,
          input: 'the cut call, once the cut point sat on the stem midpoint',
          by: 'the simulation: the stem constraint is released and physics takes over',
          output: 'the closed blades, the cut stem, and the fruit already leaving the frame',
        },
      },
      { at: { marker: 'cut', offsetS: 1 }, durationS: 4, caption: 'cut returns the distance to the stem and the blade angle' },
      { at: { marker: 'landed', offsetS: 1.6 }, durationS: 4.5, caption: 'The tomato lands in the basket: harvest confirmed' },
    ],
  },
  // (i) Le rapport. Il arrive dix secondes après la chute sur cette prise, et il avait jusqu'ici le
  // sous-titre de la coupe au-dessus de lui.
  //
  // Le bandeau reste **rétréci**, et c'est une vérification, pas une supposition : le pilote revient
  // au cadrage large deux secondes après la chute, mais l'incrustation de la caméra outil, elle, est
  // encore allumée — relevée sur les images de la prise à 104 s, 108 s, 111,4 s et 114,3 s, jusqu'à
  // la dernière. Un bandeau de largeur normale lui passerait dessus.
  {
    take: CONCEPTS,
    from: { marker: 'report' },
    to: { marker: 'end' },
    caption: 'The agent reports the harvest and the episode closes',
    highlight: ZONE.trace,
    ...TOOL_CAM_CAPTION,
  },
];

