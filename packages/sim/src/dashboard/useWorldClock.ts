import { useCallback, useSyncExternalStore } from 'react';
import type { SimRuntime } from '../core/runtime';
import type { SimClock } from './dashboardTypes';

const noop = (): void => {};

/**
 * Horloge de la sim locale. Le snapshot est une chaîne (comparée par valeur), donc le composant
 * ne se rend à nouveau que lorsque l'affichage change (dixième de seconde, facteur, pause), pas à chaque frame.
 */
export function useWorldClock(runtime: SimRuntime | null): SimClock | null {
  const subscribe = useCallback((onChange: () => void) => (runtime ? runtime.ctx.store.subscribe(onChange) : noop), [runtime]);
  const key = useSyncExternalStore(subscribe, () => {
    if (!runtime) return null;
    const s = runtime.ctx.store.get();
    return `${s.simTimeS.toFixed(1)}|${s.timeScale}|${s.paused ? 1 : 0}`;
  });
  if (key === null) return null;
  const [t, scale, paused] = key.split('|');
  return { simTimeS: Number(t), timeScale: Number(scale), paused: paused === '1' };
}
