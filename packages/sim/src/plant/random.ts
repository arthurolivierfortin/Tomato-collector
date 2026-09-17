/** mulberry32 : PRNG 32 bits déterministe, suffisant pour la génération de plant. */
export function createRng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const between = (rng: () => number, min: number, max: number): number => min + (max - min) * rng();
export const intBetween = (rng: () => number, min: number, max: number): number => Math.floor(between(rng, min, max + 1));
