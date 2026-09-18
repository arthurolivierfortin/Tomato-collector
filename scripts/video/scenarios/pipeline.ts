/**
 * Prise « pipeline » : comment une image de caméra devient la vue que reçoit l'agent.
 *
 * Le dashboard de l'issue #36 ouvre, sur la touche `x`, un écran plein format qui montre les
 * **images intermédiaires réelles** du traitement, une tuile par étape, chacune étiquetée par sa
 * provenance : image brute, contraste CLAHE, contours Canny, détection de maturité (modèle YOLOv8n
 * ONNX, ou seuillage HSV si le modèle n'est pas retenu), appariement boîte → tomate, annotations,
 * vue finale. Le pilote pose un marqueur par tuile ; c'est le montage qui fige 4 à 5 s sur chacune
 * et écrit ce qui entre, ce qui fait le travail et ce qui sort.
 *
 * **Pourquoi une prise à part, et non un passage de `concepts`.** Cet écran ne montre que du
 * traitement d'image : il n'a besoin ni de l'agent ni du serveur, seulement d'images de caméra. Le
 * glisser au milieu de la prise en direct coûterait soit la coupe et la chute — masquées par
 * l'écran plein format pendant une minute — soit un second épisode payant, puisque la tomate
 * suivante mûrit une quinzaine de secondes après la récolte. Filmée seule, en `replay` ou page
 * seule, cette séquence ne coûte rien et peut durer ce qu'il faut.
 *
 * Tant que l'issue #36 n'est pas mergée, la touche `x` n'existe pas : la vanne reste fermée, toutes
 * les étapes sont sautées, la prise dure quelques secondes et le montage retire les segments
 * `optional` qui la citent, avec un avertissement.
 */
import type { TakeMode } from '../lib/markers';
import type { Scenario, ScenarioStep } from '../lib/scenario';

/** Écran plein format du traitement des vues (issue #36, touche `x`). */
const PIPELINE_SCREEN = '[data-testid="pipeline"]';

/** Temps passé sur une tuile dans la prise ; le montage y fige ensuite 4 à 5 s. */
const TILE_MS = 2500;

/**
 * Les sept étapes, dans l'ordre de l'écran. Le nom du marqueur suit le rang : le plan de montage
 * cite `pipeline_1` … `pipeline_7` et n'a pas à connaître les libellés.
 */
export const PIPELINE_STAGES = [
  'raw camera frame',
  'CLAHE contrast',
  'Canny edges',
  'ripeness detection',
  'box to tomato matching',
  'annotations',
  'final view',
] as const;

function tiles(): ScenarioStep[] {
  return PIPELINE_STAGES.flatMap((_, i): ScenarioStep[] => [
    { kind: 'marker', name: `pipeline_${i + 1}`, gate: 'pipeline' },
    { kind: 'wait', ms: TILE_MS, gate: 'pipeline' },
  ]);
}

export function pipelineScenario(mode: TakeMode): Scenario {
  return {
    name: 'pipeline',
    mode,
    steps: [
      { kind: 'press', key: 'h' },
      { kind: 'marker', name: 'start' },
      { kind: 'wait', ms: 1500 },
      // Un journal rejoué fournit de vraies vues ; sans lui, la page rend les siennes toute seule.
      ...(mode === 'replay' ? ([{ kind: 'replay', speed: 1 }] as ScenarioStep[]) : []),
      { kind: 'wait', ms: 4000 },
      { kind: 'gate', name: 'pipeline', key: 'x', selector: PIPELINE_SCREEN },
      ...tiles(),
      { kind: 'press', key: 'Escape', gate: 'pipeline' },
      { kind: 'wait', ms: 1200 },
      { kind: 'marker', name: 'end' },
    ],
  };
}
