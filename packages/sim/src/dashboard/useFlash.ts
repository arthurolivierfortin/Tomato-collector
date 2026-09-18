import { useEffect, useState } from 'react';

/** Vrai pendant `durationMs` après chaque nouvelle valeur non nulle de `atMs` (flash des vues, blocs allumés). */
export function useFlash(atMs: number | null, durationMs: number): boolean {
  const [on, setOn] = useState(false);
  useEffect(() => {
    if (atMs === null) return;
    setOn(true);
    const timer = setTimeout(() => setOn(false), durationMs);
    return () => clearTimeout(timer);
  }, [atMs, durationMs]);
  return on;
}
