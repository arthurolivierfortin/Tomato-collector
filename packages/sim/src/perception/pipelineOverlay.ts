import type { Vec2 } from '@tomato/shared';
import { FONT_PX, PALETTE } from '../cameras/palette';
import { text, type OverlayCommand } from '../cameras/overlayTypes';
import type { Match } from './matching';
import type { Detection } from './types';

/** Couleur d'une boîte selon la classe rendue par le détecteur. */
export const DETECTION_COLOR: Record<Detection['label'], string> = { ripe: PALETTE.ripe, unripe: PALETTE.unripe };
export const BOX_WIDTH_PX = 2;
/** Décalage du texte au-dessus de la boîte ; en dessous du bord haut si la boîte touche le haut de l'image. */
export const LABEL_OFFSET_PX = 5;

const corners = (d: Detection): { from: Vec2; to: Vec2 } => {
  const [x, y, w, h] = d.bbox;
  return { from: [x, y], to: [x + w, y + h] };
};

const labelAt = (d: Detection): Vec2 => {
  const [x, y] = d.bbox;
  return [x, y - LABEL_OFFSET_PX < FONT_PX ? y + d.bbox[3] + FONT_PX : y - LABEL_OFFSET_PX];
};

/** Étape 4 : les boîtes du détecteur avec leur classe et leur confiance, telles quelles. */
export function detectionCommands(detections: readonly Detection[]): OverlayCommand[] {
  return detections.flatMap((d): OverlayCommand[] => {
    const color = DETECTION_COLOR[d.label];
    return [
      { kind: 'rect', ...corners(d), color, width: BOX_WIDTH_PX },
      text(labelAt(d), `${d.label} ${d.score.toFixed(2)}`, color, FONT_PX),
    ];
  });
}

/**
 * Étape 5 : l'association géométrique. Pour chaque boîte retenue, le centre projeté de la tomate la plus
 * proche, l'amorce qui les relie et l'identifiant attribué. Les boîtes sans identifiant restent muettes.
 */
export function matchCommands(
  detections: readonly Detection[],
  matches: readonly Match[],
  projected: ReadonlyMap<number, Vec2>,
): OverlayCommand[] {
  const out: OverlayCommand[] = [];
  for (const m of matches) {
    const centre = projected.get(m.tomatoId);
    const box = detections[m.detectionIndex];
    if (centre === undefined || box === undefined) continue;
    const [x, y, w, h] = box.bbox;
    out.push({ kind: 'rect', from: [x, y], to: [x + w, y + h], color: PALETTE.stem, width: BOX_WIDTH_PX });
    out.push({ kind: 'cross', center: centre, sizePx: 10, color: PALETTE.stem, width: 2 });
    out.push({ kind: 'line', from: [x + w / 2, y + h / 2], to: centre, color: PALETTE.stem, width: 1 });
    out.push(text(labelAt(box), `#${m.tomatoId} · ${m.distancePx.toFixed(0)} px`, PALETTE.stem, FONT_PX));
  }
  return out;
}
