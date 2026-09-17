/** Retourne verticalement un tampon RGBA lu de bas en haut (sémantique gl.readPixels) pour obtenir des lignes de haut en bas. */
export function flipRowsRgba(src: Uint8Array, width: number, height: number): Uint8ClampedArray<ArrayBuffer> {
  const rowBytes = width * 4;
  const out = new Uint8ClampedArray(src.length);
  for (let y = 0; y < height; y++) {
    out.set(src.subarray(y * rowBytes, (y + 1) * rowBytes), (height - 1 - y) * rowBytes);
  }
  return out;
}

function linearToSrgb(c: number): number {
  return c <= 0.0031308 ? 12.92 * c : 1.055 * Math.pow(c, 1 / 2.4) - 0.055;
}

function buildLinearToSrgbLut(): Uint8ClampedArray<ArrayBuffer> {
  const lut = new Uint8ClampedArray(256);
  for (let i = 0; i < 256; i++) lut[i] = Math.round(linearToSrgb(i / 255) * 255);
  return lut;
}

/** Les render targets three sont écrits en espace de travail linéaire : cette LUT ramène l'image en sRGB. */
export const LINEAR_TO_SRGB_LUT: Uint8ClampedArray<ArrayBuffer> = buildLinearToSrgbLut();

/** Applique une LUT aux canaux RGB, en place ; l'alpha est conservé. */
export function applyLutRgb(data: Uint8ClampedArray, lut: Uint8ClampedArray): void {
  for (let i = 0; i + 2 < data.length; i += 4) {
    data[i] = lut[data[i] ?? 0] ?? 0;
    data[i + 1] = lut[data[i + 1] ?? 0] ?? 0;
    data[i + 2] = lut[data[i + 2] ?? 0] ?? 0;
  }
}
