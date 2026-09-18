import { useEffect, useState } from 'react';

/** Cadence du chrono d'un appel en cours. */
export const TICK_MS = 250;
/** Cadence de l'âge des vues : il s'affiche à la seconde. */
export const AGE_TICK_MS = 1000;

/**
 * Horodatage courant rafraîchi à intervalle régulier. `fixed` fige l'horloge (tests, captures) et
 * `running: false` l'arrête : au repos, aucun minuteur ne fait redessiner la trace.
 */
export function useNow(fixed?: number, periodMs: number = TICK_MS, running = true): number {
  const [now, setNow] = useState(() => fixed ?? Date.now());
  useEffect(() => {
    if (fixed !== undefined || !running) return;
    setNow(Date.now());
    const timer = setInterval(() => setNow(Date.now()), periodMs);
    return () => clearInterval(timer);
  }, [fixed, periodMs, running]);
  return fixed ?? now;
}
