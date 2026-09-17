/** Fraction visible d'une tomate : pixels comptés dans la passe d'identifiants ÷ aire attendue du disque, bornée à [0, 1]. */
export function visibilityFraction(countPx: number, radiusCm: number, pxPerCm: number): number {
  const radiusPx = radiusCm * pxPerCm;
  const expected = Math.PI * radiusPx * radiusPx;
  if (expected <= 0) return 0;
  return Math.min(1, Math.max(0, countPx / expected));
}

export type IdColor = readonly [number, number, number];

export const MAX_TOMATO_ID = 255;

/** Couleur plate d'une tomate dans la passe d'identifiants : l'identifiant dans le canal rouge, 0 ailleurs. */
export function idColor(id: number): IdColor {
  const clamped = Math.min(MAX_TOMATO_ID, Math.max(1, Math.round(id)));
  return [clamped, 0, 0];
}

/** Inverse de idColor ; 0 quand le pixel n'appartient à aucune tomate. */
export function idFromColor(c: IdColor): number {
  return c[1] === 0 && c[2] === 0 ? c[0] : 0;
}

/** Compte les pixels par identifiant dans un tampon RGBA. */
export function countIdPixels(rgba: Uint8Array | Uint8ClampedArray): Map<number, number> {
  const counts = new Map<number, number>();
  for (let i = 0; i + 3 < rgba.length; i += 4) {
    const id = idFromColor([rgba[i] ?? 0, rgba[i + 1] ?? 0, rgba[i + 2] ?? 0]);
    if (id === 0) continue;
    counts.set(id, (counts.get(id) ?? 0) + 1);
  }
  return counts;
}
