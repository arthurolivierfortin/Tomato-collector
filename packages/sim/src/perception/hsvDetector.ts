import { labelComponents } from './components';
import { open3, type Mask } from './morphology';
import { rgbToHsv } from './rgba';
import type { Detection, RgbaImage, RipeDetector } from './types';

/** Rouge en teinte OpenCV (0..180) : H < 10 ou H > 170. */
export const RED_HUE_LOW_MAX = 10;
export const RED_HUE_HIGH_MIN = 170;
/** Saturation et valeur minimales (0..255) : excluent le fond gris et les ombres profondes. */
export const RED_SAT_MIN = 100;
export const RED_VAL_MIN = 80;
/** Aire minimale d'un blob après ouverture, en pixels d'une image 640 px (≈ un disque de 5 px de rayon). */
export const MIN_BLOB_AREA_PX = 80;

/** Masque des pixels rouges, saturés et suffisamment lumineux. */
export function redMask(img: RgbaImage): Mask {
  const n = img.width * img.height;
  const mask = new Uint8Array(n);
  for (let i = 0; i < n; i++) {
    const o = i * 4;
    const [h, s, v] = rgbToHsv(img.data[o] ?? 0, img.data[o + 1] ?? 0, img.data[o + 2] ?? 0);
    if ((h < RED_HUE_LOW_MAX || h > RED_HUE_HIGH_MIN) && s > RED_SAT_MIN && v > RED_VAL_MIN) mask[i] = 1;
  }
  return mask;
}

/**
 * Détecteur de secours (spec 4.4) : masque rouge → ouverture 3×3 → composantes connexes → aire minimale.
 * Score = taux de remplissage de la boîte (≈ 0,78 pour un disque). Résultat trié par aire décroissante.
 */
export const hsvDetector: RipeDetector = (img) => {
  const opened = open3(redMask(img), img.width, img.height);
  const comps = labelComponents(opened, img.width, img.height).filter((c) => c.area >= MIN_BLOB_AREA_PX);
  comps.sort((a, b) => b.area - a.area);
  return comps.map((c): Detection => {
    const w = c.maxX - c.minX + 1;
    const h = c.maxY - c.minY + 1;
    return { bbox: [c.minX, c.minY, w, h], score: Math.min(1, c.area / (w * h)), label: 'ripe' };
  });
};
