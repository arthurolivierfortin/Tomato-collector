/**
 * Le traitement des vues, une tuile par étape : ce qui entre, ce qui fait le travail, ce qui sort.
 *
 * Prise « pipeline », écran plein format de l'issue #36 (touche `x`). L'écran livré range **dix**
 * étapes en deux rangées de cinq : le plan cite donc `pipeline_1` … `pipeline_10`, et le cadre bleu
 * de chaque arrêt sur image est posé par `pipelineTile()`, recalé sur cette grille.
 *
 * **Chaque arrêt agrandit sa tuile.** En 1920 × 1080, une tuile fait 368 × 496 : son texte mesure
 * quatre pixels de haut et personne ne le lit. Chaque étape montre donc d'abord une seconde de
 * l'écran entier, le temps de voir *quelle* tuile est encadrée, puis quatre secondes de cette tuile
 * seule, agrandie à 85 % de la hauteur de l'image, avec à sa droite les trois éléments qui comptent :
 * ce qui entre, qui fait le travail, ce qui sort.
 *
 * Les segments restent `optional` : si la prise `pipeline` ne pose pas ses marqueurs — écran absent,
 * capture qui échoue — le montage les retire avec un avertissement au lieu d'échouer.
 */
import type { PlanEntry } from '../lib/plan';
import type { ZoomSpec } from '../lib/zoom';
import { PIPELINE_STAGES } from '../scenarios/pipeline';
import { pipelineTile } from './zones';

const PIPELINE = 'pipeline';
const STAGE_COUNT = PIPELINE_STAGES.length;

/** L'écran entier, le temps de voir quelle tuile le cadre bleu désigne. */
const SCREEN_S = 1.2;
/** La tuile agrandie : de quoi lire ses images, son étiquette et ses trois lignes. */
const ZOOM_S = 4;

/**
 * Le bandeau de sous-titre du dashboard vit à 145 px du bas, dans le bas de la colonne spectateur.
 * L'écran plein format des dix tuiles n'a pas cette géographie : tout y est information, sauf la
 * dernière ligne de texte des tuiles du bas, qui redit en français ce que le sous-titre dit en
 * anglais. Le bandeau descend donc dessus — et, depuis la relecture de la v2, il prend **toute la
 * largeur** : la boîte qui épouse le texte laissait dépasser à sa droite un fragment de légende
 * française, lisible à moitié.
 */
const PIPELINE_CAPTION = { captionBottom: 29, captionWidth: 1100, captionFullWidth: true } as const;

/** Les trois éléments de chaque étape, dans la langue de la vidéo. Le reste est sur l'image. */
type StageDetail = Omit<ZoomSpec, 'source'>;

const PIPELINE_DETAIL: readonly StageDetail[] = [
  {
    input: 'the 3D scene, seen by the orthographic front camera',
    by: 'camera',
    output: 'an 800 by 800 RGBA buffer, exactly what the sensor reads. No processing yet.',
  },
  {
    input: 'the RGBA buffer',
    by: 'OpenCV (CLAHE, clip 2, tiles 8 by 8)',
    output: 'an equalised grey plane, so dark corners regain contrast',
  },
  {
    input: 'the grey plane',
    by: 'OpenCV (Canny 50/150)',
    output: 'white contours over a render darkened to 35 percent. This is layer one of every agent view.',
  },
  {
    input: 'the raw frame, reduced to 640 by 640',
    by: 'model YOLOv8n ONNX',
    output: '8 boxes, each with a class and a confidence. Only this stage decides ripe.',
  },
  {
    input: 'the 8 boxes and the projected 3D centres',
    by: 'logic',
    output: 'one tomato id per ripe box. No simulation ripeness is read here.',
  },
  {
    input: 'the camera pose and its field of view',
    by: 'camera calibration',
    output: 'the metric frame that makes a view measurable in centimetres',
  },
  {
    input: 'the arm pose',
    by: 'robot state',
    output: 'blade position, blade angle and basket outline, as the encoders report them',
  },
  {
    input: 'tomato positions, ids and stems',
    by: 'simulation',
    output: 'numbered circles and a target stem line. This is help given, not measured.',
  },
  {
    input: 'the target tomato and the basket',
    by: 'geometry (vertical)',
    output: 'the fall line the tomato is expected to follow once the stem is cut',
  },
  {
    input: 'all the layers above',
    by: 'the output stage, every layer stacked',
    output: 'one 800 by 800 PNG per camera, plus a JSON block. Exactly what get_views returns.',
  },
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

function detail(i: number): StageDetail {
  return PIPELINE_DETAIL[i] ?? { input: 'the previous stage', by: 'the pipeline', output: 'the next layer' };
}

/**
 * Un segment par tuile : une seconde d'écran entier, puis l'agrandissement. Le segment s'arrête à
 * l'instant de l'agrandissement, qui est donc le dernier sous-plan : aucune seconde de la prise
 * n'est montrée deux fois, et rien ne revient à l'écran entier après coup.
 */
export function pipelineSegments(): PlanEntry[] {
  return PIPELINE_STAGES.map((stage, i) => {
    const caption = `Stage ${i + 1} of ${STAGE_COUNT}: ${stage}`;
    const at = { marker: `pipeline_${i + 1}`, offsetS: SCREEN_S };
    return {
      take: PIPELINE,
      optional: true,
      from: { marker: `pipeline_${i + 1}` },
      to: at,
      ...(TITLES[i] === undefined ? {} : { title: TITLES[i] }),
      ...PIPELINE_CAPTION,
      caption,
      // Le cadre reste posé pendant tout le segment : sur un écran de dix tuiles identiques, c'est
      // lui qui dit de laquelle parle le sous-titre, et l'agrandissement qui suit enchaîne dessus.
      highlight: pipelineTile(i),
      freezeAt: [{ at, durationS: ZOOM_S, caption, zoom: { source: pipelineTile(i), ...detail(i) } }],
    };
  });
}
