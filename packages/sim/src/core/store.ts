import type { WorldState } from '@tomato/shared';

export interface WorldStore {
  get(): WorldState;
  set(next: WorldState): void;
  update(fn: (state: WorldState) => WorldState): void;
  subscribe(fn: (state: WorldState) => void): () => void;
}

/** Unique source de vérité de la géométrie côté sim. Immuable : chaque update produit un nouvel objet. */
export function createWorldStore(initial: WorldState): WorldStore {
  let state = initial;
  const listeners = new Set<(s: WorldState) => void>();
  const set = (next: WorldState): void => {
    state = next;
    for (const l of listeners) l(state);
  };
  return {
    get: () => state,
    set,
    update: (fn) => set(fn(state)),
    subscribe: (fn) => {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
  };
}
