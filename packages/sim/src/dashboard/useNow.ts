import { useEffect, useState } from 'react';

/** Cadence par défaut des horloges de l'interface (âge des vues, chrono d'un appel en cours). */
export const TICK_MS = 250;

/**
 * Horodatage courant rafraîchi à intervalle régulier. `fixed` fige l'horloge (tests, captures) :
 * le composant reçoit alors cette valeur et n'arme aucun minuteur.
 */
export function useNow(fixed?: number, periodMs: number = TICK_MS): number {
  const [now, setNow] = useState(() => fixed ?? Date.now());
  useEffect(() => {
    if (fixed !== undefined) return;
    const timer = setInterval(() => setNow(Date.now()), periodMs);
    return () => clearInterval(timer);
  }, [fixed, periodMs]);
  return fixed ?? now;
}
