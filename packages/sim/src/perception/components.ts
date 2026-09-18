import type { Mask } from './morphology';

/** Composante connexe (4-connexité) d'un masque binaire : boîte englobante inclusive et aire en pixels. */
export interface Component {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
  area: number;
}

/** Étiquetage par remplissage avec une pile explicite (pas de récursion). Ordre : première apparition en balayage. */
export function labelComponents(mask: Mask, width: number, height: number): Component[] {
  const seen = new Uint8Array(width * height);
  const stack = new Int32Array(width * height);
  const out: Component[] = [];
  for (let start = 0; start < width * height; start++) {
    if (mask[start] !== 1 || seen[start] === 1) continue;
    const c: Component = { minX: width, minY: height, maxX: -1, maxY: -1, area: 0 };
    let top = 0;
    stack[top++] = start;
    seen[start] = 1;
    const push = (j: number): void => {
      if (mask[j] === 1 && seen[j] !== 1) {
        seen[j] = 1;
        stack[top++] = j;
      }
    };
    while (top > 0) {
      const i = stack[--top] ?? 0;
      const x = i % width;
      const y = (i - x) / width;
      c.area++;
      if (x < c.minX) c.minX = x;
      if (x > c.maxX) c.maxX = x;
      if (y < c.minY) c.minY = y;
      if (y > c.maxY) c.maxY = y;
      if (x > 0) push(i - 1);
      if (x < width - 1) push(i + 1);
      if (y > 0) push(i - width);
      if (y < height - 1) push(i + width);
    }
    out.push(c);
  }
  return out;
}
