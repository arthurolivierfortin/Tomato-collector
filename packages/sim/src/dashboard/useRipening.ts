import { useCallback, useSyncExternalStore } from 'react';
import type { SimRuntime } from '../core/runtime';
import { ripeningOf, type Ripening } from './ripening';

const noop = (): void => {};

/**
 * Maturité de la tomate en cours, lue dans la sim locale (issue #23). Le serveur n'envoie un
 * `snapshot` qu'à la connexion : sans cette lecture directe, la barre resterait figée et le
 * spectateur ne verrait pas la tomate mûrir. Comme `useWorldClock`, le snapshot est une chaîne,
 * donc le rendu ne se refait qu'au pour cent près, pas à chaque frame.
 */
export function useRipening(runtime: SimRuntime | null): Ripening | null {
  const subscribe = useCallback((onChange: () => void) => (runtime ? runtime.ctx.store.subscribe(onChange) : noop), [runtime]);
  const key = useSyncExternalStore(subscribe, () => {
    if (!runtime) return null;
    const r = ripeningOf(runtime.ctx.store.get());
    return r === null ? '' : `${r.tomatoId}|${Math.round(r.ripeness * 100)}`;
  });
  if (key === null || key === '') return null;
  const [id, pct] = key.split('|');
  return { tomatoId: Number(id), ripeness: Number(pct) / 100 };
}
