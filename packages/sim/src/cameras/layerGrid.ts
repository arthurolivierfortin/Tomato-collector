import { VIEW_SIZE_PX, type CameraId, type CameraPose, type Vec2 } from '@tomato/shared';
import { gridSegments, scaleBar, type GridSegment } from './gridLines';
import { imageAxes, pxPerCmOf } from './ortho';
import { line, text, type OverlayCommand } from './overlayTypes';
import { FONT_PX, FONT_PX_LARGE, PALETTE } from './palette';

/** Hauteur du bandeau haut (couche 5) ; les étiquettes de la marge gauche commencent dessous. */
export const HEADER_HEIGHT_PX = 44;
/** Ligne de base des valeurs de l'axe horizontal (marge basse) et abscisse des valeurs de l'axe vertical (marge gauche). */
const BOTTOM_LABEL_Y = VIEW_SIZE_PX - 8;
const LEFT_LABEL_X = 6;
const SCALE_BAR_ORIGIN: Vec2 = [24, VIEW_SIZE_PX - 34];
const AXIS_LINE_WIDTH = 1.5;
/** Marges où la valeur d'axe serait tronquée par le bord ou recouverte par le nom de l'axe (`X →`). */
const LABEL_MARGIN_LEFT_PX = 18;
const LABEL_MARGIN_RIGHT_PX = 56;

/** Abscisse du point du segment d'ordonnée y ; null si le segment est horizontal ou n'atteint pas y. */
export function xAtY(s: GridSegment, y: number): number | null {
  const dy = s.toPx[1] - s.fromPx[1];
  if (Math.abs(dy) < 1e-9) return null;
  const t = (y - s.fromPx[1]) / dy;
  if (t < 0 || t > 1) return null;
  return s.fromPx[0] + t * (s.toPx[0] - s.fromPx[0]);
}

/** Ordonnée du point du segment d'abscisse x ; null si le segment est vertical ou n'atteint pas x. */
export function yAtX(s: GridSegment, x: number): number | null {
  const dx = s.toPx[0] - s.fromPx[0];
  if (Math.abs(dx) < 1e-9) return null;
  const t = (x - s.fromPx[0]) / dx;
  if (t < 0 || t > 1) return null;
  return s.fromPx[1] + t * (s.toPx[1] - s.fromPx[1]);
}

/** Couche 2 : grille projetée, axes monde (valeur 0) plus marqués, valeurs en marge, noms des axes, barre d'échelle. */
export function gridCommands(camId: CameraId, pose: CameraPose, spacingCm: number): OverlayCommand[] {
  const { horizontal, vertical } = imageAxes(camId);
  const segments = gridSegments(camId, pose, spacingCm, pose.widthCm);
  const out: OverlayCommand[] = [];
  for (const s of segments) {
    const isWorldAxis = s.valueCm === 0;
    out.push(line(s.fromPx, s.toPx, isWorldAxis ? PALETTE.axes : PALETTE.grid, isWorldAxis ? AXIS_LINE_WIDTH : 1));
  }
  for (const s of segments) {
    if (s.axis === horizontal) {
      const x = xAtY(s, BOTTOM_LABEL_Y);
      if (x !== null && x >= LABEL_MARGIN_LEFT_PX && x <= VIEW_SIZE_PX - LABEL_MARGIN_RIGHT_PX) {
        out.push(text([x, BOTTOM_LABEL_Y], String(s.valueCm), PALETTE.axes, FONT_PX, 'center'));
      }
    } else {
      const y = yAtX(s, LEFT_LABEL_X);
      if (y !== null && y > HEADER_HEIGHT_PX + FONT_PX && y < VIEW_SIZE_PX - 40) out.push(text([LEFT_LABEL_X, y + 4], String(s.valueCm), PALETTE.axes));
    }
  }
  out.push(text([VIEW_SIZE_PX - 8, BOTTOM_LABEL_Y], `${horizontal} →`, PALETTE.text, FONT_PX_LARGE, 'right'));
  out.push(text([LEFT_LABEL_X, HEADER_HEIGHT_PX + 18], `${vertical} ↑`, PALETTE.text, FONT_PX_LARGE));
  const bar = scaleBar(pxPerCmOf(pose));
  const [bx, by] = SCALE_BAR_ORIGIN;
  out.push(
    line([bx, by], [bx + bar.lengthPx, by], PALETTE.text, 3),
    line([bx, by - 5], [bx, by + 5], PALETTE.text, 2),
    line([bx + bar.lengthPx, by - 5], [bx + bar.lengthPx, by + 5], PALETTE.text, 2),
    text([bx, by - 9], `${bar.labelCm} cm`, PALETTE.text),
  );
  return out;
}
