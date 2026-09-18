import type { ServerToDashboard } from '@tomato/shared';

export type BridgeStatus = 'connected' | 'disconnected';

/**
 * Ce que le dashboard attend d'un pont (réel M5 `createBridge` ou simulé `createFakeBridge`).
 * Compatible structurellement avec `Bridge` du contrat Étape 3 ; `onStatus` tolère un retour void.
 */
export interface DashboardBridge {
  onServerMessage(fn: (m: ServerToDashboard) => void): () => void;
  status(): BridgeStatus;
  onStatus(fn: (s: BridgeStatus) => void): (() => void) | void;
  close(): void;
}

/** Une entrée de scénario rejouable (même forme que `messages[]` d'un fichier d'épisode). */
export interface ScriptEntry {
  atMs: number;
  message: ServerToDashboard;
}
