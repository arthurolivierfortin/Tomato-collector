import { makeRgba } from './rgba';
import type { RgbaImage } from './types';

export interface Disc {
  cx: number;
  cy: number;
  r: number;
  rgb: readonly [number, number, number];
}

/** Rouge mûr, orange en transition et vert immature de la palette (#c8261b, #e08a1e, #3f9a3a). */
export const RIPE_RGB: readonly [number, number, number] = [200, 38, 27];
export const TURNING_RGB: readonly [number, number, number] = [224, 138, 30];
export const UNRIPE_RGB: readonly [number, number, number] = [63, 154, 58];
/** Fond gris sombre de la serre. */
export const BACKGROUND_RGB: readonly [number, number, number] = [40, 44, 42];

/** Image de test : fond uniforme et disques pleins, pour les tests des détecteurs. */
export function discImage(width: number, height: number, discs: readonly Disc[]): RgbaImage {
  const img = makeRgba(width, height, BACKGROUND_RGB);
  for (const d of discs) {
    for (let y = Math.max(0, Math.floor(d.cy - d.r)); y <= Math.min(height - 1, Math.ceil(d.cy + d.r)); y++) {
      for (let x = Math.max(0, Math.floor(d.cx - d.r)); x <= Math.min(width - 1, Math.ceil(d.cx + d.r)); x++) {
        if ((x - d.cx) ** 2 + (y - d.cy) ** 2 <= d.r * d.r) img.data.set([d.rgb[0], d.rgb[1], d.rgb[2], 255], (y * width + x) * 4);
      }
    }
  }
  return img;
}
