/**
 * Le traitement des vues, une tuile par étape : ce qui entre, ce qui fait le travail, ce qui sort.
 *
 * Prise « pipeline », écran plein format de l'issue #36 (touche `x`). L'écran livré range **dix**
 * étapes en deux rangées de cinq : le plan cite donc `pipeline_1` … `pipeline_10`, et le cadre bleu
 * de chaque arrêt sur image est posé par `pipelineTile()`, recalé sur cette grille.
 *
 * Les segments restent `optional` : si la prise `pipeline` ne pose pas ses marqueurs — écran absent,
 * capture qui échoue — le montage les retire avec un avertissement au lieu d'échouer.
 */
import type { PlanEntry } from '../lib/plan';
import { PIPELINE_STAGES } from '../scenarios/pipeline';
import { pipelineTile } from './zones';

const PIPELINE = 'pipeline';
const STAGE_COUNT = PIPELINE_STAGES.length;

/**
 * Le bandeau de sous-titre du dashboard vit à 145 px du bas, dans le bas de la colonne spectateur.
 * L'écran plein format des dix tuiles n'a pas cette géographie : tout y est information, sauf la
 * dernière ligne de texte des tuiles du bas, qui redit en français ce que le sous-titre dit en
 * anglais. Le bandeau descend donc dessus, et s'élargit pour tenir en deux lignes.
 */
const PIPELINE_CAPTION = { captionBottom: 14, captionWidth: 1100 } as const;

/** Dix tuiles, dix arrêts sur image : ce qui entre, qui fait le travail, ce qui sort. */
const PIPELINE_CAPTIONS: readonly string[] = [
  'Raw camera frame. In: the 3D scene. Out: an 800 by 800 RGBA buffer, straight from the orthographic camera. No processing yet.',
  'CLAHE contrast (OpenCV, plain image processing). In: the RGBA buffer. Out: an equalised grey plane, so dark corners regain contrast.',
  'Canny edges 50/150 (OpenCV). In: the grey plane. Out: white contours over a darkened render. This is layer one of every agent view.',
  'Ripeness detection. A model does the work: YOLOv8n in ONNX on a 640 by 640 frame. Out: boxes, a class and a confidence. Only this stage decides ripe.',
  'Box to tomato matching (plain logic). In: the boxes and the projected 3D centres. Out: one tomato id per ripe box. No simulation ripeness is read.',
  'Grid, axes and scale bar (camera calibration). In: the camera pose and field. Out: the metric frame that makes a view measurable in centimetres.',
  'Scissors and basket (robot state). In: the arm pose. Out: blade position, blade angle and basket outline, as an encoder would report them.',
  'Tomato markers and target stem line (simulation). In: positions, ids and stems. Out: circles and a target line. This is help given, not measured.',
  'Predicted fall line (geometry). In: the target and the basket. Out: the vertical the tomato is expected to follow once the stem is cut.',
  'Final view, exactly as the agent receives it. In: all the layers above. Out: one PNG per camera, plus a JSON block.',
];

/**
 * Deux cartons dans la séquence, et pas un de plus : un à l'entrée, un au passage à la seconde
 * rangée. Ils sont portés par les segments eux-mêmes (`title`) plutôt que posés en cartons libres,
 * pour qu'ils disparaissent avec la séquence si la prise `pipeline` venait à manquer.
 */
const TITLES: Record<number, { text: string; durationS: number; subtitle: string }> = {
  0: {
    text: 'From camera frame to what the agent sees',
    durationS: 5.5,
    subtitle: 'Ten stages. For each one: what goes in, what does the work, what comes out.',
  },
  5: {
    text: 'Second row: the annotation layers',
    durationS: 5,
    subtitle: 'Each layer is labelled by its source: camera calibration, robot state, simulation, geometry, output.',
  },
};

/** Un arrêt sur image par tuile du traitement des vues ; segment facultatif si la prise manque. */
export function pipelineSegments(): PlanEntry[] {
  return PIPELINE_STAGES.map((stage, i) => ({
    take: PIPELINE,
    optional: true,
    from: { marker: `pipeline_${i + 1}` },
    to: { marker: i + 1 === STAGE_COUNT ? 'end' : `pipeline_${i + 2}` },
    ...(TITLES[i] === undefined ? {} : { title: TITLES[i] }),
    ...PIPELINE_CAPTION,
    caption: `Stage ${i + 1} of ${STAGE_COUNT}: ${stage}`,
    // Le cadre reste posé pendant tout le segment, pas seulement sur l'arrêt sur image : sur un
    // écran de dix tuiles identiques, c'est lui qui dit de laquelle parle le sous-titre.
    highlight: pipelineTile(i),
    freezeAt: [{ at: { marker: `pipeline_${i + 1}`, offsetS: 0.6 }, durationS: 5, caption: PIPELINE_CAPTIONS[i] ?? stage, highlight: pipelineTile(i) }],
  }));
}
