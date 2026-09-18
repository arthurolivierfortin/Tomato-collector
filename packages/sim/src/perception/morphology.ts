/** Masque binaire (0 ou 1) de width × height ; hors image = 0. */
export type Mask = Uint8Array;

/** Vrai si le pixel (x, y) et ses 8 voisins valent tous `wanted` (hors image = 0). */
function neighbourhoodIs(mask: Mask, width: number, height: number, x: number, y: number, wanted: 0 | 1): boolean {
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      const nx = x + dx;
      const ny = y + dy;
      const v = nx < 0 || ny < 0 || nx >= width || ny >= height ? 0 : (mask[ny * width + nx] ?? 0);
      if (v !== wanted) return false;
    }
  }
  return true;
}

/** Érosion par un carré 3×3 : un pixel reste à 1 si lui et ses 8 voisins valent 1. */
export function erode3(mask: Mask, width: number, height: number): Mask {
  const out = new Uint8Array(width * height);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (mask[y * width + x] === 1 && neighbourhoodIs(mask, width, height, x, y, 1)) out[y * width + x] = 1;
    }
  }
  return out;
}

/** Dilatation par un carré 3×3 : un pixel passe à 1 si lui ou l'un de ses 8 voisins vaut 1. */
export function dilate3(mask: Mask, width: number, height: number): Mask {
  const out = new Uint8Array(width * height);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (!neighbourhoodIs(mask, width, height, x, y, 0)) out[y * width + x] = 1;
    }
  }
  return out;
}

/** Ouverture morphologique 3×3 (érosion puis dilatation) : supprime le bruit isolé, conserve les blobs. */
export function open3(mask: Mask, width: number, height: number): Mask {
  return dilate3(erode3(mask, width, height), width, height);
}
