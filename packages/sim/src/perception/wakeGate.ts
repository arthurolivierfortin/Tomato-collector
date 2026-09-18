/** Nombre de frames consécutives « mûre » avant réveil (spec 3, N configurable, défaut 5). */
export const DEFAULT_CONSECUTIVE_FRAMES = 5;

export interface WakeGate {
  /** Une observation par tick : l'identifiant vu mûr, ou null. Renvoie l'identifiant à la n-ième observation consécutive, sinon null. */
  push(tomatoId: number | null): number | null;
  reset(): void;
}

/** Compteur de vues consécutives d'un même identifiant ; tout changement (autre id ou null) remet à zéro. */
export function createWakeGate(n: number = DEFAULT_CONSECUTIVE_FRAMES): WakeGate {
  let current: number | null = null;
  let count = 0;
  return {
    push(tomatoId) {
      if (tomatoId === null || tomatoId !== current) {
        current = tomatoId;
        count = tomatoId === null ? 0 : 1;
      } else {
        count++;
      }
      return current !== null && count === n ? current : null;
    },
    reset() {
      current = null;
      count = 0;
    },
  };
}
