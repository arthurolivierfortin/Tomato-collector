import { useCallback, useMemo, useState } from 'react';
import { createDefaultWorld } from '@tomato/shared';
import { createBridge, type Bridge } from './bridge/bridge';
import { createFakeBridge } from './bridge/fakeBridge';
import { emptyViews } from './bridge/viewsFallback';
import { cameraModule, getRenderViews, type RenderViewsFn } from './cameras/cameraModule';
import type { SimModule } from './core/module';
import { createRuntime, type SimRuntime } from './core/runtime';
import { createBridgeSlot } from './dashboard/bridgeSlot';
import type { DashboardBridge } from './dashboard/bridgeTypes';
import { Dashboard } from './dashboard/Dashboard';
import { createDashboardStore } from './dashboard/dashboardStore';
import { buildDemoScript } from './dashboard/demoScript';
import { fetchServerModel } from './dashboard/episodesApi';
import { perceptionModule } from './perception/perceptionModule';
import { plantModule } from './plant/plantModule';
import { atRest } from './robot/restPose';
import { robotModule } from './robot/robotModule';
import type { SceneHandle } from './three/createScene';

const SEED = 20260917;
/** Hub WebSocket du serveur (M5) ; la page réessaie toutes les 2 s tant que le serveur n'est pas lancé. */
const WS_URL = import.meta.env.VITE_TOMATO_WS_URL ?? 'ws://localhost:7332';

/** Modules de la sim, dans l'ordre de dispatch des actions : M1 (plant), M2 (robot), M3 (cameras), M4 (perception). */
const MODULES: SimModule[] = [plantModule, robotModule, cameraModule, perceptionModule];

declare global {
  interface Window {
    __tomato?: {
      runtime: SimRuntime;
      renderViews?: RenderViewsFn;
      /** Pont WebSocket réel (M5) ; présent dès que le runtime est prêt. */
      bridge?: Bridge;
      /** Exposés en dev seulement (Playwright, replay à la main depuis la console). */
      fakeBridge?: typeof createFakeBridge;
      attachBridge?: (bridge: DashboardBridge) => void;
      stopReplay?: () => void;
      demoScript?: typeof buildDemoScript;
    };
  }
}

export function App() {
  const store = useMemo(() => createDashboardStore(), []);
  const slot = useMemo(() => createBridgeSlot(store), [store]);
  const [runtime, setRuntime] = useState<SimRuntime | null>(null);

  const onSceneReady = useCallback(
    (scene: SceneHandle) => {
      // StrictMode monte la scène deux fois : la scène déjà détruite ne doit pas publier son runtime,
      // sinon window.__tomato pointe une scène qui ne rend plus et les actions restent invisibles.
      let disposed = false;
      let stopFrames: (() => void) | null = null;
      let offReset: (() => void) | null = null;
      let live: Bridge | null = null;
      void createRuntime(atRest(createDefaultWorld(SEED)), scene, MODULES).then((rt) => {
        if (disposed) return;
        const renderViews = getRenderViews();
        const dev = import.meta.env.DEV ? { fakeBridge: createFakeBridge, attachBridge: slot.play, stopReplay: slot.stop, demoScript: buildDemoScript } : {};
        window.__tomato = { runtime: rt, ...(renderViews ? { renderViews } : {}), ...dev };
        // Le pont lit `renderViews` à chaque demande : présent après le merge de M3, sinon vues sans image.
        live = createBridge({
          url: WS_URL,
          runtime: rt,
          renderViews: (cameras) => window.__tomato?.renderViews?.(cameras) ?? Promise.resolve(emptyViews(rt.ctx.store.get())),
        });
        window.__tomato = { ...window.__tomato, runtime: rt, bridge: live };
        slot.setLive(live);
        // Issue #31 : un replay repart d'une scène propre — le bras revient se garer.
        offReset = slot.onReset(() => rt.ctx.store.update(atRest));
        stopFrames = scene.onFrame((dt) => rt.step(dt));
        setRuntime(rt);
        void fetchServerModel().then((model) => {
          if (model !== null && !disposed) store.dispatch({ type: 'local_model', model });
        });
      });
      return () => {
        disposed = true;
        offReset?.();
        stopFrames?.();
        live?.close();
        slot.setLive(null);
      };
    },
    [slot, store],
  );

  return <Dashboard store={store} slot={slot} runtime={runtime} onSceneReady={onSceneReady} />;
}
