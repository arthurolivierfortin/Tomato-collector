import { VIEW_SIZE_PX } from '@tomato/shared';

export const GRID_SPACINGS_CM = [1, 2, 5, 10, 20] as const;
export type GridSpacingCm = (typeof GRID_SPACINGS_CM)[number];

/** Nombre maximal de lignes de grille sur la largeur de l'image (spec : 8 à 16). */
export const MAX_GRID_LINES = 16;

/** Plus petit espacement qui donne au plus 16 lignes sur la largeur visible. */
export function chooseSpacing(pxPerCm: number, sizePx: number = VIEW_SIZE_PX): GridSpacingCm {
  const widthCm = sizePx / pxPerCm;
  for (const spacing of GRID_SPACINGS_CM) {
    if (widthCm / spacing <= MAX_GRID_LINES) return spacing;
  }
  return 20;
}
