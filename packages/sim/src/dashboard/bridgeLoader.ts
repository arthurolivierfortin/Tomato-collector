import type { CameraId, ViewsResult } from '@tomato/shared';
import type { SimRuntime } from '../core/runtime';
import type { DashboardBridge } from './bridgeTypes';

/** Hub WebSocket du serveur M5 (contrat Étape 3). */
export const WS_URL = 'ws://localhost:7332';

export interface LiveBridgeOptions {
  url: string;
  runtime: SimRuntime;
  renderViews: (cameras: CameraId[]) => Promise<ViewsResult>;
}

export type ModuleLoader = () => Promise<unknown>;
type BridgeFactory = (opts: LiveBridgeOptions) => DashboardBridge;

/**
 * `createBridge` de M5 n'existe pas tant que M5 n'est pas mergé : Vite résout le glob à la
 * compilation et renvoie un objet vide si le fichier manque, sans casser le build.
 */
const CANDIDATES: Record<string, ModuleLoader> = import.meta.glob('../bridge/createBridge.ts');

export async function loadLiveBridge(
  opts: LiveBridgeOptions,
  candidates: Record<string, ModuleLoader> = CANDIDATES,
): Promise<DashboardBridge | null> {
  for (const load of Object.values(candidates)) {
    const mod = (await load()) as { createBridge?: unknown };
    if (typeof mod.createBridge === 'function') return (mod.createBridge as BridgeFactory)(opts);
  }
  return null;
}
