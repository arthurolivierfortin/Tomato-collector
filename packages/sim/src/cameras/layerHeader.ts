import { VIEW_SIZE_PX, type CameraId, type CameraPose, type ViewsPayload } from '@tomato/shared';
import { HEADER_HEIGHT_PX } from './layerGrid';
import { gridPlanePoint, imageAxes, pxPerCmOf } from './ortho';
import { text, type OverlayCommand } from './overlayTypes';
import { FONT_PX_LARGE, PALETTE } from './palette';

function planeLabel(camId: CameraId, pose: CameraPose): string {
  const p = gridPlanePoint(camId, pose);
  switch (camId) {
    case 'top':
      return `z=${p[2]}`;
    case 'front':
      return `y=${p[1]}`;
    case 'side':
      return `x=${p[0]}`;
  }
}

/** Couche 5 : bandeau haut avec nom de la vue, axes, pose caméra, px/cm, grille, temps sim, mention PIVOTÉE. */
export function headerCommands(camId: CameraId, pose: CameraPose, payload: ViewsPayload, spacingCm: number): OverlayCommand[] {
  const { horizontal, vertical } = imageAxes(camId);
  const [x, y, z] = pose.positionCm;
  const out: OverlayCommand[] = [
    { kind: 'rect', from: [0, 0], to: [VIEW_SIZE_PX, HEADER_HEIGHT_PX], color: PALETTE.band, width: 0, fill: PALETTE.band },
    text(
      [8, 18],
      `VUE ${camId.toUpperCase()}   ${horizontal} → droite, ${vertical} → haut   t = ${payload.simTimeS.toFixed(1)} s   phase ${payload.phase}`,
      PALETTE.text,
      FONT_PX_LARGE,
    ),
    text(
      [8, 36],
      `caméra (${x.toFixed(0)}, ${y.toFixed(0)}, ${z.toFixed(0)}) cm   lacet ${pose.yawDeg.toFixed(0)}°  tangage ${pose.tiltDeg.toFixed(0)}°   ${pxPerCmOf(pose).toFixed(2)} px/cm   grille ${spacingCm} cm dans le plan ${planeLabel(camId, pose)}`,
      PALETTE.text,
    ),
  ];
  if (pose.yawDeg !== 0 || pose.tiltDeg !== 0) out.push(text([VIEW_SIZE_PX - 8, 18], 'PIVOTÉE', PALETTE.warn, FONT_PX_LARGE, 'right'));
  return out;
}
