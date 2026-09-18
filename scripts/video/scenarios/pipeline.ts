/**
 * Prise « pipeline » : comment une image de caméra devient la vue que reçoit l'agent.
 *
 * Le dashboard de l'issue #36 ouvre, sur la touche `x`, un écran plein format qui montre les
 * **images intermédiaires réelles** du traitement, une tuile par étape, chacune étiquetée par sa
 * provenance : image brute, contraste CLAHE, contours Canny, détection de maturité (modèle YOLOv8n
 * ONNX, ou seuillage HSV si le modèle n'est pas retenu), appariement boîte → tomate, grille et
 * échelle, ciseaux et panier, repères de tomates, ligne de chute, vue finale. Le pilote pose un
 * marqueur par tuile ; c'est le montage qui fige 4 à 5 s sur chacune et écrit ce qui entre, ce qui
 * fait le travail et ce qui sort.
 *
 * **Dix tuiles, cinq colonnes.** L'écran livré par #36 range les dix étapes en deux rangées pleines
 * de cinq (`PipelinePanel.tsx`), et non en sept tuiles comme le prévoyait le plan écrit avant la
 * fusion. Les marqueurs vont donc de `pipeline_1` à `pipeline_10`, et `pipelineTile()` est recalé
 * sur cette grille.
 *
 * **Pourquoi une prise à part, et non un passage de `concepts`.** Cet écran ne montre que du
 * traitement d'image : il n'a besoin ni de l'agent ni du serveur, seulement d'images de caméra. Le
 * glisser au milieu de la prise en direct coûterait soit la coupe et la chute — masquées par
 * l'écran plein format pendant une minute — soit un second épisode payant, puisque la tomate
 * suivante mûrit une quinzaine de secondes après la récolte. Filmée seule, avec l'agent coupé,
 * cette séquence ne coûte rien et peut durer ce qu'il faut.
 */
import type { TakeMode } from '../lib/markers';
import type { Scenario, ScenarioStep } from '../lib/scenario';

/** Écran plein format du traitement des vues (issue #36, touche `x`). */
const PIPELINE_SCREEN = '[data-testid="pipeline"]';
/** Une tuile rendue : la capture des dix tampons est asynchrone, l'écran s'ouvre avant elle. */
const PIPELINE_TILE = '[data-testid="pipeline-tile"]';

/** Temps passé sur une tuile dans la prise ; le montage y fige ensuite 4 à 5 s. */
const TILE_MS = 2500;

/**
 * Les dix étapes, dans l'ordre de l'écran. Le nom du marqueur suit le rang : le plan de montage
 * cite `pipeline_1` … `pipeline_10` et n'a pas à connaître les libellés.
 */
export const PIPELINE_STAGES = [
  'raw camera frame',
  'CLAHE contrast',
  'Canny edges',
  'ripeness detection',
  'box to tomato matching',
  'grid, axes and scale',
  'scissors and basket',
  'tomato markers and stem line',
  'predicted fall line',
  'final view',
] as const;

function tiles(): ScenarioStep[] {
  return PIPELINE_STAGES.flatMap((_, i): ScenarioStep[] => [
    { kind: 'marker', name: `pipeline_${i + 1}`, gate: 'pipeline' },
    { kind: 'wait', ms: TILE_MS, gate: 'pipeline' },
  ]);
}

/**
 * Avant d'ouvrir l'écran : de quoi lui donner quelque chose à montrer.
 *
 * En direct (agent coupé, donc sans coût), on attend qu'une tomate soit mûre et que le détecteur
 * l'ait vue : sans détection, les tuiles « détection », « appariement », « repères » et « chute »
 * n'auraient rien à dessiner. En replay, le journal rejoué fournit la cible.
 */
function beforeScreen(mode: TakeMode): ScenarioStep[] {
  if (mode === 'replay') return [{ kind: 'replay', speed: 1 }, { kind: 'wait', ms: 4000 }];
  return [
    { kind: 'waitForRipeness', minPercent: 100, timeoutMs: 180_000 },
    // La détection prend 2,5 à 6 s après la maturité (docs/perception-model.md) : large de côté.
    { kind: 'wait', ms: 10_000 },
  ];
}

export function pipelineScenario(mode: TakeMode): Scenario {
  return {
    name: 'pipeline',
    mode,
    steps: [
      { kind: 'press', key: 'h' },
      { kind: 'marker', name: 'start' },
      { kind: 'wait', ms: 1500 },
      ...beforeScreen(mode),
      { kind: 'gate', name: 'pipeline', key: 'x', selector: PIPELINE_SCREEN },
      // La capture des dix tampons dure une à deux secondes : sans cette attente, le premier arrêt
      // sur image tomberait sur « Rendu des étapes en cours… ».
      { kind: 'waitForSelector', selector: PIPELINE_TILE, timeoutMs: 60_000, gate: 'pipeline' },
      { kind: 'wait', ms: 1200, gate: 'pipeline' },
      ...tiles(),
      { kind: 'press', key: 'Escape', gate: 'pipeline' },
      { kind: 'wait', ms: 1200 },
      { kind: 'marker', name: 'end' },
    ],
  };
}
