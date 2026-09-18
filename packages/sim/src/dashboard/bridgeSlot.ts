import type { BridgeStatus, DashboardBridge } from './bridgeTypes';
import type { DashboardStore } from './dashboardStore';

export type SlotMode = 'none' | 'live' | 'replay';

/**
 * Branche le store sur un pont à la fois : le pont réel (M5) ou un pont simulé pendant un replay.
 * Pendant un replay, les messages du pont réel sont ignorés ; `stop()` rebranche le pont réel.
 */
export interface BridgeSlot {
  setLive(bridge: DashboardBridge | null): void;
  play(bridge: DashboardBridge): void;
  stop(): void;
  mode(): SlotMode;
  /** Prévenu au démarrage d'un replay (issue #31 : la sim remet le bras à sa pose de repos). */
  onReset(fn: () => void): () => void;
}

export function createBridgeSlot(store: DashboardStore): BridgeSlot {
  let live: DashboardBridge | null = null;
  let replay: DashboardBridge | null = null;
  let unsubscribe: (() => void)[] = [];
  const resetListeners = new Set<() => void>();

  const connectionOf = (kind: 'live' | 'replay', status: BridgeStatus): 'connected' | 'disconnected' | 'replay' =>
    kind === 'replay' ? 'replay' : status;

  const unlisten = (): void => {
    for (const off of unsubscribe) off();
    unsubscribe = [];
  };

  const listen = (bridge: DashboardBridge, kind: 'live' | 'replay'): void => {
    unlisten();
    unsubscribe.push(bridge.onServerMessage((m) => store.dispatch(m)));
    const offStatus = bridge.onStatus((s) => store.dispatch({ type: 'local_connection', connection: connectionOf(kind, s) }));
    if (typeof offStatus === 'function') unsubscribe.push(offStatus);
    store.dispatch({ type: 'local_connection', connection: connectionOf(kind, bridge.status()) });
  };

  const disconnected = (): void => store.dispatch({ type: 'local_connection', connection: 'disconnected' });

  return {
    setLive(bridge) {
      live = bridge;
      if (replay) return;
      if (bridge) listen(bridge, 'live');
      else {
        unlisten();
        disconnected();
      }
    },
    play(bridge) {
      unlisten();
      replay?.close();
      replay = bridge;
      store.dispatch({ type: 'local_reset' });
      for (const fn of resetListeners) fn();
      listen(bridge, 'replay');
    },
    stop() {
      if (!replay) return;
      unlisten();
      replay.close();
      replay = null;
      if (live) listen(live, 'live');
      else disconnected();
    },
    mode: () => (replay ? 'replay' : live ? 'live' : 'none'),
    onReset(fn) {
      resetListeners.add(fn);
      return () => resetListeners.delete(fn);
    },
  };
}
