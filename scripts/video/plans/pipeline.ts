/**
 * Le traitement des vues, une tuile par étape : ce qui entre, ce qui fait le travail, ce qui sort.
 *
 * Prise « pipeline », écran plein format de l'issue #36 (touche `x`). Tant que cette issue n'est pas
 * mergée, la prise ne pose aucun marqueur `pipeline_<n>` et ces segments, tous `optional`, sont
 * retirés du montage avec un avertissement.
 */
import type { PlanEntry } from '../lib/plan';
import { PIPELINE_STAGES } from '../scenarios/pipeline';
import { pipelineTile } from './zones';

const PIPELINE = 'pipeline';

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

/** Un arrêt sur image par tuile du traitement des vues ; segment facultatif tant que #36 n'est pas là. */
export function pipelineSegments(): PlanEntry[] {
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

