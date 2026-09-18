import type { ServerToDashboard } from '@tomato/shared';
import type { DashboardMessage, DashboardState, LocalMessage } from './dashboardTypes';
import { initialDashboardState } from './initialState';
import { reduceLocal } from './reduceLocal';
import { reduceServer } from './reduceServer';

export { DEFAULT_MODEL, initialDashboardState } from './initialState';
export { TRACE_MAX } from './reduceServer';

function isLocal(m: DashboardMessage): m is LocalMessage {
  return m.type.startsWith('local_');
}

/** Réducteur pur : messages du serveur (`ServerToDashboard`) et messages locaux (`local_*`). */
export function reduce(state: DashboardState, message: DashboardMessage, nowMs: number = Date.now()): DashboardState {
  return isLocal(message) ? reduceLocal(state, message) : reduceServer(state, message as ServerToDashboard, nowMs);
}

/** Store minimal compatible avec `useSyncExternalStore` (snapshot immuable, abonnés notifiés sur changement réel). */
export interface DashboardStore {
  get(): DashboardState;
  dispatch(message: DashboardMessage, nowMs?: number): void;
  subscribe(fn: () => void): () => void;
}

export function createDashboardStore(initial: DashboardState = initialDashboardState()): DashboardStore {
  let state = initial;
  const listeners = new Set<() => void>();
  return {
    get: () => state,
    dispatch: (message, nowMs = Date.now()) => {
      const next = reduce(state, message, nowMs);
      if (next === state) return;
      state = next;
      for (const fn of listeners) fn();
    },
    subscribe: (fn) => {
      listeners.add(fn);
      return () => {
        listeners.delete(fn);
      };
    },
  };
}
