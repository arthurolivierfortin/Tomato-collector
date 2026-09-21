/**
 * Partie 1 « Les concepts » : une prise **en direct**, avec l'agent réel, pendant laquelle le
 * pilote appuie sur les touches de tournage aux vrais moments de l'épisode.
 *
 * La première version fabriquait cette partie avec l'épisode scripté de la page
 * (`buildDemoScript`) : la scène 3D ne bougeait pas pendant que la trace annonçait la chute, et le
 * faux journal contredisait les règles du monde (un `stem_cut` à 78° quand la règle en demande
 * moins de 45). Tout ce qui est montré ici vient maintenant d'un épisode réel.
 *
 * Rien n'est déclenché : chaque touche attend un état de la page — une phase, une ligne de la
 * trace, une flèche du schéma bloc. Les marqueurs portent le nom de l'événement, et le plan de
 * montage n'a plus qu'à les citer.
 *
 * Ordre à l'écran : mûrissement → détection → réveil (schéma bloc, touche `b`, ouvert par défaut)
 * → premières vues → loupe `z` sur les trois vues → gizmos de caméra `c` → trace et flux brut
 * (`t`, ouvert par défaut) → mode « ce que voit l'agent » `v` → retour en vue spectateur pour la
 * coupe et la chute.
 */
import type { TakeMode } from '../lib/markers';
import type { Scenario, ScenarioStep } from '../lib/scenario';

const TRACE = '[data-testid="trace"]';
const LIGHTBOX = '[data-testid="lightbox"]';
const FEATURED_IMAGE = '[data-testid="view-featured"] img';
/** La flèche allumée du schéma bloc ; chaque activité y reste au moins 1,2 s (`blockQueue`). */
const BLOCK_FLOW = '[data-testid="block-flow"]';
/** Panneau « Perception » de l'issue #36, touche `p` : absent tant que l'issue n'est pas mergée. */
const PERCEPTION_PANEL = '[data-testid="perception-panel"]';

/** Un épisode mené par Claude prend une minute, parfois deux : large de côté, jamais serré. */
const EPISODE_TIMEOUT_MS = 300_000;
/** Le mûrissement est local à la page : 15 s de temps simulé, mais la page peut être occupée. */
const RIPENING_TIMEOUT_MS = 180_000;

/**
 * Durées de maintien, choisies pour tenir dans la fenêtre réelle entre les premières vues et la
 * coupe. Sur l'épisode de référence (2026-09-18T16-36-29-196Z-t1) il s'écoule 47 s entre
 * « Vues demandées » et « Coupe » ; la somme des maintiens ci-dessous fait 38 s, ce qui laisse une
 * dizaine de secondes de marge pour revenir en vue spectateur avant la chute. Répétition du
 * 2026-09-18 : `normal_view` à 66,5 s pour un `cut` à 68,6 s, la chute était bien à l'écran.
 */
const HOLD = {
  /** Le terminal en demi-écran, pendant que le premier `tool_use` de la session s'y inscrit. */
  terminal: 6000,
  /** Une vue dans la loupe (0,8 s d'ouverture en plus, soit ~4,8 s par vue à l'écran). */
  lightbox: 4000,
  /** Les gizmos des trois caméras dans la scène. */
  gizmos: 4000,
  /** La colonne de trace et le flux brut, pendant que l'agent écrit. */
  trace: 4000,
  /** Le mode « ce que voit l'agent ». */
  agentView: 6000,
} as const;

/** Ouverture du plan : cadrage propre, puis le mûrissement de la première tomate. */
function opening(mode: TakeMode): ScenarioStep[] {
  const steps: ScenarioStep[] = [
    // Contrôles masqués dès la première image : cadrage propre, et le bas de la colonne spectateur
    // — là où le montage pose ses sous-titres — se libère. Le schéma bloc (`b`) et le flux brut
    // (`t`) sont ouverts par défaut (`initialState.ts`) : rien à presser, ils sont là dès le début.
    { kind: 'press', key: 'h' },
    { kind: 'marker', name: 'app' },
    // Garantit au moins 3 s de plan avant le seuil de maturité, quelle que soit l'avance du plant.
    { kind: 'wait', ms: 3000 },
  ];
  // Répétition sans coût : le même scénario, joué contre un journal réel rejoué par le pont simulé.
  if (mode === 'replay') steps.push({ kind: 'replay', speed: 1 });
  return steps;
}

export function conceptsScenario(mode: TakeMode): Scenario {
  return {
    name: 'concepts',
    mode,
    steps: [
      ...opening(mode),

      // (b) Le plant et la tomate qui mûrit : la cellule « mûrissement » du bandeau monte seule.
      { kind: 'waitForRipeness', minPercent: 50, timeoutMs: RIPENING_TIMEOUT_MS },
      { kind: 'marker', name: 'ripening_50' },

      // (c) La perception détecte, (d) le serveur réveille l'agent. Les deux flèches du schéma bloc
      // s'allument l'une après l'autre, 1,2 s chacune : on attend la flèche, pas une durée.
      { kind: 'waitForPhase', phase: 'detected', timeoutMs: RIPENING_TIMEOUT_MS },
      { kind: 'marker', name: 'detected' },
      { kind: 'waitForText', selector: BLOCK_FLOW, text: 'mûre', timeoutMs: 30_000 },
      { kind: 'marker', name: 'wake_perception' },
      { kind: 'waitForText', selector: BLOCK_FLOW, text: 'réveil', timeoutMs: 30_000 },
      { kind: 'marker', name: 'wake_agent' },

      // Panneau « Perception » (touche `p`, issue #36) : ce qui décide de la maturité, ce sont les
      // images des caméras, pas l'état de la simulation. Derrière une vanne : tant que la touche
      // n'existe pas dans la page, les trois étapes sont sautées sans bruit et le marqueur n'est
      // pas posé ; le plan de montage cite ce segment en `optional`.
      { kind: 'gate', name: 'perception', key: 'p', selector: PERCEPTION_PANEL },
      { kind: 'marker', name: 'perception_panel', gate: 'perception' },
      { kind: 'wait', ms: 4000, gate: 'perception' },
      { kind: 'press', key: 'p', gate: 'perception' },

      // (e) L'agent demande ses trois vues : premier appel d'outil de l'épisode.
      { kind: 'waitForText', selector: TRACE, text: 'Vues demandées', timeoutMs: EPISODE_TIMEOUT_MS },
      { kind: 'marker', name: 'views_first' },
      { kind: 'waitForSelector', selector: FEATURED_IMAGE, timeoutMs: EPISODE_TIMEOUT_MS },
      // Le temps que les trois images arrivent, et que le premier `tool_use` de la session
      // s'inscrive dans le terminal filmé en parallèle : c'est ce que montre le segment
      // « The agent is a real Claude Code session », juste avant la loupe.
      { kind: 'wait', ms: HOLD.terminal },

      // (f) La loupe (`z`) sur la vue mise en avant — `front` par défaut — puis `side` et `top`.
      { kind: 'press', key: 'z' },
      { kind: 'wait', ms: 800 },
      { kind: 'marker', name: 'lightbox_front' },
      { kind: 'wait', ms: HOLD.lightbox },
      { kind: 'click', selector: `${LIGHTBOX} >> role=button[name="Vue side"]` },
      { kind: 'wait', ms: 800 },
      { kind: 'marker', name: 'lightbox_side' },
      { kind: 'wait', ms: HOLD.lightbox },
      { kind: 'click', selector: `${LIGHTBOX} >> role=button[name="Vue top"]` },
      { kind: 'wait', ms: 800 },
      { kind: 'marker', name: 'lightbox_top' },
      { kind: 'wait', ms: HOLD.lightbox },
      { kind: 'press', key: 'Escape' },
      { kind: 'wait', ms: 800 },

      // (g) D'où viennent ces images : les gizmos des trois caméras dans la scène (`c`).
      { kind: 'press', key: 'c' },
      { kind: 'wait', ms: 900 },
      { kind: 'marker', name: 'gizmos' },
      { kind: 'wait', ms: HOLD.gizmos },
      { kind: 'press', key: 'c' },
      { kind: 'wait', ms: 600 },

      // (h) Les outils MCP : la trace et le flux brut pendant que l'agent oriente les ciseaux.
      // L'agent oriente les lames sur presque tous les épisodes (étape 3 du prompt système, avant
      // la première approche) ; s'il la saute, la prise s'arrête ici et garde tout ce qui précède.
      { kind: 'waitForText', selector: TRACE, text: 'Ciseaux orientés', timeoutMs: EPISODE_TIMEOUT_MS },
      { kind: 'marker', name: 'rotate' },
      // Cadrage coupe (`k`, issue #42) dès le positionnement fin : c'est « Ciseaux orientés » que
      // ce scénario-ci sait détecter, et c'est le dernier geste de l'agent avant les approches. Le
      // cadrage large montre le robot entier, il ne montrera jamais un geste de 6 cm ; la
      // transition de 0,8 s se joue donc maintenant, loin de la coupe, et non pendant.
      { kind: 'press', key: 'k' },
      { kind: 'wait', ms: HOLD.trace },

      // (i) Le mode « ce que voit l'agent » (`v`) pendant le positionnement.
      { kind: 'press', key: 'v' },
      { kind: 'wait', ms: 1200 },
      { kind: 'marker', name: 'agent_view' },
      { kind: 'wait', ms: HOLD.agentView },
      { kind: 'press', key: 'v' },
      // Retour en vue spectateur AVANT la coupe : c'est là que la tomate tombe dans le panier.
      { kind: 'wait', ms: 1200 },
      { kind: 'marker', name: 'normal_view' },

      // (j) La coupe, la chute, le rapport.
      { kind: 'waitForText', selector: TRACE, text: 'Coupe', timeoutMs: EPISODE_TIMEOUT_MS },
      { kind: 'marker', name: 'cut' },
      { kind: 'waitForText', selector: TRACE, text: 'dans le panier', timeoutMs: EPISODE_TIMEOUT_MS },
      { kind: 'marker', name: 'landed' },
      // Retour au cadrage large deux secondes après la chute, au moment même où l'incrustation de
      // la caméra outil s'éteint d'elle-même (`TOOL_CAM_LINGER_S`) : les deux plans rapprochés
      // s'en vont ensemble, et le rapport se lit sur le robot entier.
      { kind: 'wait', ms: 2000 },
      { kind: 'press', key: 'k' },
      { kind: 'waitForText', selector: TRACE, text: 'Rapport :', timeoutMs: EPISODE_TIMEOUT_MS },
      { kind: 'marker', name: 'report' },
      // Queue courte : passé une poignée de secondes, la tomate suivante mûrit et un second
      // épisode — payant — démarrerait pendant les cartons de fin.
      { kind: 'wait', ms: 3000 },
      { kind: 'marker', name: 'end' },
      { kind: 'wait', ms: 1000 },
    ],
  };
}
