/**
 * Partie 1 « Les concepts » : une prise unique qui passe en revue l'application, le mûrissement,
 * la détection, le réveil, les trois vues, les outils MCP et la coupe. Sans serveur : l'épisode
 * scripté de la page (`buildDemoScript`) est injecté au ralenti pour que chaque moment soit
 * atteignable et marquable. Les arrêts sur image et les cartons sont dans le plan de montage.
 */
import type { Scenario } from '../lib/scenario';

const TRACE = '[data-testid="trace"]';
const SESSION = '[data-testid="agent-session"]';
const VIEWS = '[data-testid="views"]';
const LIGHTBOX = '[data-testid="lightbox"]';

/** ×0,2 : l'épisode scripté de 5,8 s dure 29 s, chaque appel d'outil reste une seconde à l'écran. */
const DEMO_SPEED = 0.2;

export const conceptsScenario: Scenario = {
  name: 'concepts',
  mode: 'replay',
  steps: [
    // (a) L'application : vue 3D, dashboard, bandeau de statuts.
    { kind: 'wait', ms: 3000 },
    { kind: 'marker', name: 'app' },
    { kind: 'wait', ms: 5000 },

    // (b) Le plant et la tomate qui mûrit : la cellule « mûrissement » monte dans le bandeau.
    { kind: 'sim', action: 'ripen_next' },
    { kind: 'marker', name: 'maturite' },
    { kind: 'wait', ms: 7000 },

    // (c) → (g) : l'épisode scripté au ralenti.
    { kind: 'demo', speed: DEMO_SPEED },
    { kind: 'waitForPhase', phase: 'detected' },
    { kind: 'marker', name: 'detection' },
    { kind: 'wait', ms: 1400 },
    // (d) Le serveur réveille l'agent : les flèches du schéma bloc s'allument une par une (1,2 s).
    { kind: 'marker', name: 'bloc_perception' },
    { kind: 'wait', ms: 1400 },
    { kind: 'marker', name: 'bloc_reveil' },
    { kind: 'waitForText', selector: TRACE, text: 'Vues demandées' },
    { kind: 'marker', name: 'outil_vues' },
    { kind: 'waitForText', selector: VIEWS, text: 'il y a' },
    { kind: 'marker', name: 'vues_recues' },
    // (f) Les outils MCP : l'appel `move_scissors` en cours (le résultat arrive 1 s plus tard à
    // ×0,2), puis son résultat, puis le flux brut de la session.
    { kind: 'waitForText', selector: TRACE, text: 'Ciseaux → X 8' },
    { kind: 'marker', name: 'mcp_appel' },
    { kind: 'waitForText', selector: SESSION, text: 'collision' },
    { kind: 'marker', name: 'mcp_resultat' },
    { kind: 'wait', ms: 1200 },
    { kind: 'marker', name: 'flux_brut' },
    // (g) La coupe et la chute dans le panier.
    { kind: 'waitForText', selector: TRACE, text: 'Coupe' },
    { kind: 'marker', name: 'coupe' },
    { kind: 'waitForText', selector: TRACE, text: 'dans le panier' },
    { kind: 'marker', name: 'chute' },
    { kind: 'waitForText', selector: TRACE, text: 'Épisode terminé' },
    { kind: 'marker', name: 'rapport' },
    { kind: 'wait', ms: 2500 },

    // (e) Les trois vues de l'agent, à la loupe : grille cm, marqueurs, tige, ciseaux, panier.
    { kind: 'press', key: 'z' },
    { kind: 'click', selector: `${LIGHTBOX} >> role=button[name="Vue top"]` },
    { kind: 'wait', ms: 800 },
    { kind: 'marker', name: 'vue_top' },
    { kind: 'wait', ms: 3200 },
    { kind: 'click', selector: `${LIGHTBOX} >> role=button[name="Vue front"]` },
    { kind: 'wait', ms: 800 },
    { kind: 'marker', name: 'vue_front' },
    { kind: 'wait', ms: 3200 },
    { kind: 'click', selector: `${LIGHTBOX} >> role=button[name="Vue side"]` },
    { kind: 'wait', ms: 800 },
    { kind: 'marker', name: 'vue_side' },
    { kind: 'wait', ms: 3200 },
    { kind: 'press', key: 'Escape' },
    { kind: 'wait', ms: 800 },

    // D'où viennent les vues : les gizmos des trois caméras dans la scène 3D.
    { kind: 'press', key: 'c' },
    { kind: 'wait', ms: 900 },
    { kind: 'marker', name: 'cameras' },
    { kind: 'wait', ms: 3200 },
    { kind: 'press', key: 'c' },

    // Le cadrage de tournage : « ce que voit l'agent » (v) sans les contrôles (h).
    { kind: 'press', key: 'v' },
    { kind: 'press', key: 'h' },
    { kind: 'wait', ms: 1200 },
    { kind: 'marker', name: 'mode_agent' },
    { kind: 'wait', ms: 4000 },
    { kind: 'press', key: 'h' },
    { kind: 'press', key: 'v' },
    { kind: 'wait', ms: 1500 },
  ],
};
