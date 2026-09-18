import type { ServerToDashboard } from '@tomato/shared';
import type { Bridge, BridgeStatus } from './bridge';

/** Une entrée de scénario : même forme que `messages[]` d'un journal d'épisode (`GET /episodes/:id`). */
export interface ScriptEntry {
  atMs: number;
  message: ServerToDashboard;
}

/**
 * Bridge simulé pour M7 (tests et replay) : rejoue `script` dans l'ordre des `atMs`, divisés par `speed`.
 * Se déclare connecté ; `close()` annule ce qui reste.
 */
export function createFakeBridge(script: readonly ScriptEntry[], speed = 1): Bridge {
  const listeners = new Set<(m: ServerToDashboard) => void>();
  const statusListeners = new Set<(s: BridgeStatus) => void>();
  let status: BridgeStatus = 'connected';
  const timers = [...script]
    .sort((a, b) => a.atMs - b.atMs)
    .map((entry) =>
      setTimeout(() => {
        for (const fn of listeners) fn(entry.message);
      }, entry.atMs / speed),
    );
  return {
    onServerMessage(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    status: () => status,
    onStatus(fn) {
      statusListeners.add(fn);
      return () => statusListeners.delete(fn);
    },
    close() {
      for (const t of timers) clearTimeout(t);
      if (status === 'disconnected') return;
      status = 'disconnected';
      for (const fn of statusListeners) fn('disconnected');
    },
  };
}
