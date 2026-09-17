/** Signaux internes entre modules de la sim (jamais envoyés au serveur ; voir SimEvent pour cela). */
export type SimSignal =
  | { type: 'tomato_cut'; tomatoId: number }
  | { type: 'plant_regenerated'; seed: number };

export interface Signals {
  emit(signal: SimSignal): void;
  on<T extends SimSignal['type']>(type: T, fn: (signal: Extract<SimSignal, { type: T }>) => void): () => void;
}

export function createSignals(): Signals {
  const handlers = new Map<string, Set<(s: SimSignal) => void>>();
  return {
    emit: (signal) => {
      for (const fn of handlers.get(signal.type) ?? []) fn(signal);
    },
    on: (type, fn) => {
      const set = handlers.get(type) ?? new Set();
      handlers.set(type, set);
      const wrapped = fn as (s: SimSignal) => void;
      set.add(wrapped);
      return () => set.delete(wrapped);
    },
  };
}
