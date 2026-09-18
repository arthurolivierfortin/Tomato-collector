/**
 * Ce que le modèle voit avant, pendant et après le mûrissement — prise « detection », gratuite.
 *
 * Le reste du film traite la détection comme un événement : un bandeau s'allume, l'agent se réveille.
 * Ici on s'arrête sur la décision elle-même, dans le panneau « Perception » (touche `p`) ouvert du
 * début à la fin : tomate verte, « 0 ripe · 8 unripe » ; la tomate rougit en lecture continue ;
 * première boîte `ripe` avec sa confiance ; la porte de réveil qui se remplit, cinq frames
 * consécutives. La suite — le réveil et l'agent — reste sur la prise `concepts`.
 *
 * La prise est filmée avec `TOMATO_AGENT=off` : elle n'a rien coûté. Les boîtes, les scores, les
 * temps d'inférence et la porte viennent du vrai détecteur ; seule la session de l'agent n'existe
 * pas, et la séquence s'arrête avant elle.
 */
import type { PlanEntry } from '../lib/plan';
import { PERCEPTION_ZOOM, ZONE } from './zones';

const DETECTION = 'detection';

/** Agrandissement du panneau : trois secondes de plus qu'un cadre bleu, et tout devient lisible. */
const ZOOM_S = 4.5;

export const detectionSegments: PlanEntry[] = [
  {
    take: DETECTION,
    from: { marker: 'start' },
    to: { marker: 'first_ripe_box', offsetS: 0.6 },
    title: {
      text: 'Perception decides, frame by frame',
      durationS: 4,
      subtitle: 'Before, during and after ripeness: what the model actually sees, and what it reports',
    },
    caption: 'The Perception panel shows the frame the detector receives, and what it finds in it',
    highlight: ZONE.perceptionPanel,
    freezeAt: [
      {
        at: { marker: 'start', offsetS: 1.5 },
        durationS: ZOOM_S,
        caption: 'Before ripeness: the model sees 8 unripe tomatoes and no ripe one',
        zoom: {
          source: PERCEPTION_ZOOM,
          input: 'the raw camera frame, no annotation, 640 by 640',
          by: 'model YOLOv8n ONNX 640',
          output: '0 ripe, 8 unripe. The wake gate is empty and tracks no tomato.',
        },
      },
      {
        at: { marker: 'first_ripe_box', offsetS: 0.6 },
        durationS: ZOOM_S,
        caption: 'The first ripe box appears, with its confidence',
        zoom: {
          source: PERCEPTION_ZOOM,
          input: 'the same frame, with tomato 1 now red',
          by: 'model YOLOv8n ONNX 640',
          output: 'ripe 0.76 on tomato 1. The gate starts counting: 1 frame of 5.',
        },
      },
    ],
  },
  {
    take: DETECTION,
    from: { marker: 'first_ripe_box', offsetS: 0.6 },
    // Juste avant le marqueur : la porte tire à 5/5 puis retombe à 0/5 dans la seconde qui suit.
    to: { marker: 'gate_5', offsetS: -0.2 },
    caption: 'One frame is not enough: the gate wants five in a row, on the same tomato',
    highlight: ZONE.perceptionPanel,
    freezeAt: [
      {
        at: { marker: 'gate_5', offsetS: -0.2 },
        durationS: ZOOM_S,
        caption: 'Five consecutive frames: the gate is full and the server is told',
        zoom: {
          source: PERCEPTION_ZOOM,
          input: 'five detections in a row on tomato 1',
          by: 'logic (the wake gate)',
          output: 'ripe 0.97, gate 5 of 5. This is what opens an episode.',
        },
      },
    ],
  },
];
