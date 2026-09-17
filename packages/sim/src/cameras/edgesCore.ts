/** Luminance Rec. 601 par pixel. */
export function grayscale(rgba: Uint8ClampedArray, pixelCount: number): Float32Array {
  const gray = new Float32Array(pixelCount);
  for (let i = 0; i < pixelCount; i++) {
    const o = i * 4;
    gray[i] = 0.299 * (rgba[o] ?? 0) + 0.587 * (rgba[o + 1] ?? 0) + 0.114 * (rgba[o + 2] ?? 0);
  }
  return gray;
}

/** Amplitude du gradient de Sobel ; la bordure d'un pixel reste à 0. */
export function sobelMagnitude(gray: Float32Array, width: number, height: number): Float32Array {
  const out = new Float32Array(width * height);
  const at = (x: number, y: number): number => gray[y * width + x] ?? 0;
  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const gx =
        -at(x - 1, y - 1) + at(x + 1, y - 1) - 2 * at(x - 1, y) + 2 * at(x + 1, y) - at(x - 1, y + 1) + at(x + 1, y + 1);
      const gy =
        -at(x - 1, y - 1) - 2 * at(x, y - 1) - at(x + 1, y - 1) + at(x - 1, y + 1) + 2 * at(x, y + 1) + at(x + 1, y + 1);
      out[y * width + x] = Math.hypot(gx, gy);
    }
  }
  return out;
}

/** Blanc opaque là où l'amplitude atteint le seuil, transparent ailleurs. */
export function thresholdToWhite(magnitude: Float32Array, threshold: number): Uint8ClampedArray<ArrayBuffer> {
  const out = new Uint8ClampedArray(magnitude.length * 4);
  for (let i = 0; i < magnitude.length; i++) {
    if ((magnitude[i] ?? 0) >= threshold) out.set([255, 255, 255, 255], i * 4);
  }
  return out;
}

/** Copie assombrie : RGB × factor, alpha forcé à 255. */
export function darkenRgba(rgba: Uint8ClampedArray, factor: number): Uint8ClampedArray<ArrayBuffer> {
  const out = new Uint8ClampedArray(rgba.length);
  for (let i = 0; i + 3 < rgba.length; i += 4) {
    out[i] = (rgba[i] ?? 0) * factor;
    out[i + 1] = (rgba[i + 1] ?? 0) * factor;
    out[i + 2] = (rgba[i + 2] ?? 0) * factor;
    out[i + 3] = 255;
  }
  return out;
}

/** Composition « over » de `over` (avec alpha) sur `base` (opaque). */
export function composeRgba(base: Uint8ClampedArray, over: Uint8ClampedArray): Uint8ClampedArray<ArrayBuffer> {
  const out = new Uint8ClampedArray(base.length);
  for (let i = 0; i + 3 < base.length; i += 4) {
    const a = (over[i + 3] ?? 0) / 255;
    out[i] = (over[i] ?? 0) * a + (base[i] ?? 0) * (1 - a);
    out[i + 1] = (over[i + 1] ?? 0) * a + (base[i + 1] ?? 0) * (1 - a);
    out[i + 2] = (over[i + 2] ?? 0) * a + (base[i + 2] ?? 0) * (1 - a);
    out[i + 3] = 255;
  }
  return out;
}
