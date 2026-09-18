import { useCallback, useSyncExternalStore } from 'react';
import type { SimRuntime } from '../core/runtime';
import { ripeningOf, type Ripening } from './ripening';

const noop = (): void => {};

/**
 * Maturité de la tomate en cours, lue dans la sim locale (issue #23). Le serveur n'envoie un
 * `snapshot` qu'à la connexion : sans cette lecture directe, la barre resterait figée et le
 * spectateur ne verrait pas la tomate mûrir. Comme `useWorldClock`, le snapshot est une chaîne,
 * donc le rendu ne se refait qu'au pour cent près, pas à chaque frame.
 *
 * Trois réponses distinctes : `undefined` = pas de sim locale, au bandeau de retomber sur le
 * snapshot ; `null` = la sim locale dit que rien ne mûrit ; sinon la tomate et sa maturité.
 */
export function useRipening(runtime: SimRuntime | null): Ripening | null | undefined {
  const subscribe = useCallback((onChange: () => void) => (runtime ? runtime.ctx.store.subscribe(onChange) : noop), [runtime]);
  const key = useSyncExternalStore(subscribe, () => {
    if (!runtime) return null;
    const r = ripeningOf(runtime.ctx.store.get());
    return r === null ? '' : `${r.tomatoId}|${Math.round(r.ripeness * 100)}`;
  });
  if (key === null) return undefined;
  if (key === '') return null;
  const [id, pct] = key.split('|');
  return { tomatoId: Number(id), ripeness: Number(pct) / 100 };
}
