import type { CameraId, CameraPose, Vec2, Vec3 } from '@tomato/shared';
import { gridPlanePoint, imageAxes, projectToPixel, type WorldAxis } from './ortho';

/** Ligne de grille : `axis` est l'axe dont la coordonnée vaut `valueCm` sur toute la ligne. */
export interface GridSegment {
  axis: WorldAxis;
  valueCm: number;
  fromPx: Vec2;
  toPx: Vec2;
}

export interface ScaleBar {
  lengthPx: number;
  labelCm: 5 | 10 | 20;
}

const AXIS_INDEX: Record<WorldAxis, 0 | 1 | 2> = { X: 0, Y: 1, Z: 2 };

/** Longueurs de barre d'échelle candidates, de la plus longue à la plus courte. */
const SCALE_BAR_CM = [20, 10, 5] as const;
/** Longueur maximale de la barre en pixels. */
export const MAX_SCALE_BAR_PX = 200;

function withAxis(base: Vec3, axis: WorldAxis, value: number): Vec3 {
  const v: [number, number, number] = [base[0], base[1], base[2]];
  v[AXIS_INDEX[axis]] = value;
  return v;
}

/**
 * Lignes des deux axes monde portés par l'image, dans le plan passant par le point visé,
 * de −extentCm à +extentCm autour de ce point, projetées avec projectToPixel.
 */
export function gridSegments(camId: CameraId, pose: CameraPose, spacingCm: number, extentCm: number): GridSegment[] {
  const { horizontal, vertical } = imageAxes(camId);
  const origin = gridPlanePoint(camId, pose);
  const out: GridSegment[] = [];
  const emit = (constAxis: WorldAxis, varAxis: WorldAxis): void => {
    const c = origin[AXIS_INDEX[constAxis]];
    const v0 = origin[AXIS_INDEX[varAxis]];
    const first = Math.ceil((c - extentCm) / spacingCm);
    const last = Math.floor((c + extentCm) / spacingCm);
    for (let i = first; i <= last; i++) {
      const valueCm = i * spacingCm;
      const onLine = withAxis(origin, constAxis, valueCm);
      const a = withAxis(onLine, varAxis, v0 - extentCm);
      const b = withAxis(onLine, varAxis, v0 + extentCm);
      out.push({ axis: constAxis, valueCm, fromPx: projectToPixel(camId, pose, a), toPx: projectToPixel(camId, pose, b) });
    }
  };
  emit(horizontal, vertical); // lignes « verticales » dans l'image : coordonnée horizontale constante
  emit(vertical, horizontal); // lignes « horizontales » dans l'image
  return out;
}

/** Barre d'échelle : la plus longue de 20, 10, 5 cm qui tient dans MAX_SCALE_BAR_PX ; sinon 5 cm. */
export function scaleBar(pxPerCm: number): ScaleBar {
  for (const labelCm of SCALE_BAR_CM) {
    const lengthPx = labelCm * pxPerCm;
    if (lengthPx <= MAX_SCALE_BAR_PX) return { lengthPx, labelCm };
  }
  return { lengthPx: 5 * pxPerCm, labelCm: 5 };
}
