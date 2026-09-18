import type { RgbaImage } from './types';

/** Teinte 0..180, saturation 0..255, valeur 0..255 : convention OpenCV 8 bits. */
export type Hsv = readonly [number, number, number];

/** Conversion RGB (0..255) → HSV à l'échelle OpenCV (H sur 0..180, S et V sur 0..255), arrondie. */
export function rgbToHsv(r: number, g: number, b: number): Hsv {
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const delta = max - min;
  const s = max === 0 ? 0 : (255 * delta) / max;
  let hDeg = 0;
  if (delta > 0) {
    if (max === r) hDeg = (60 * (g - b)) / delta;
    else if (max === g) hDeg = 120 + (60 * (b - r)) / delta;
    else hDeg = 240 + (60 * (r - g)) / delta;
    if (hDeg < 0) hDeg += 360;
  }
  return [Math.round(hDeg / 2) % 180, Math.round(s), Math.round(max)];
}

/** Crée une image RGBA opaque de couleur uniforme. */
export function makeRgba(width: number, height: number, rgb: readonly [number, number, number] = [0, 0, 0]): RgbaImage {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let i = 0; i < width * height; i++) data.set([rgb[0], rgb[1], rgb[2], 255], i * 4);
  return { width, height, data };
}

/** Rééchantillonnage bilinéaire vers width × height ; l'alpha est forcé à 255. Renvoie l'image telle quelle si la taille est déjà bonne. */
export function resizeRgba(img: RgbaImage, width: number, height: number): RgbaImage {
  if (img.width === width && img.height === height) return img;
  const out = new Uint8ClampedArray(width * height * 4);
  const sx = img.width / width;
  const sy = img.height / height;
  const at = (x: number, y: number, c: number): number => img.data[(y * img.width + x) * 4 + c] ?? 0;
  for (let y = 0; y < height; y++) {
    const fy = Math.max(0, Math.min(img.height - 1, (y + 0.5) * sy - 0.5));
    const y0 = Math.floor(fy);
    const y1 = Math.min(img.height - 1, y0 + 1);
    const wy = fy - y0;
    for (let x = 0; x < width; x++) {
      const fx = Math.max(0, Math.min(img.width - 1, (x + 0.5) * sx - 0.5));
      const x0 = Math.floor(fx);
      const x1 = Math.min(img.width - 1, x0 + 1);
      const wx = fx - x0;
      const o = (y * width + x) * 4;
      for (let c = 0; c < 3; c++) {
        const top = at(x0, y0, c) * (1 - wx) + at(x1, y0, c) * wx;
        const bottom = at(x0, y1, c) * (1 - wx) + at(x1, y1, c) * wx;
        out[o + c] = Math.round(top * (1 - wy) + bottom * wy);
      }
      out[o + 3] = 255;
    }
  }
  return { width, height, data: out };
}
