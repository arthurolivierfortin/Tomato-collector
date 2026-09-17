import { useCallback } from 'react';
import { createDefaultWorld, type CameraId, type ViewsResult } from '@tomato/shared';
import { AgentViews } from './cameras/AgentViews';
import { cameraModule, getRenderViews } from './cameras/cameraModule';
import { createRuntime, type SimRuntime } from './core/runtime';
import type { SimModule } from './core/module';
import { plantModule } from './plant/plantModule';
import { robotModule } from './robot/robotModule';
import { SpectatorView } from './three/SpectatorView';
import type { SceneHandle } from './three/createScene';

const SEED = 20260917;

/** Modules de la sim, dans l'ordre de dispatch des actions : M1 (plant), M2 (robot), M3 (cameras). */
const MODULES: SimModule[] = [plantModule, robotModule, cameraModule];

declare global {
  interface Window {
    __tomato?: { runtime: SimRuntime; renderViews?: (cameras: CameraId[]) => Promise<ViewsResult> };
  }
}

export function App() {
  const onReady = useCallback((scene: SceneHandle) => {
    // StrictMode monte la scène deux fois : la scène déjà détruite ne doit pas publier son runtime,
    // sinon window.__tomato pointe une scène qui ne rend plus et les actions restent invisibles.
    let disposed = false;
    let stopFrames: (() => void) | null = null;
    void createRuntime(createDefaultWorld(SEED), scene, MODULES).then((runtime) => {
      if (disposed) return;
      const renderViews = getRenderViews();
      window.__tomato = renderViews ? { runtime, renderViews } : { runtime };
      stopFrames = scene.onFrame((dt) => runtime.step(dt));
    });
    return () => {
      disposed = true;
      stopFrames?.();
    };
  }, []);

  return (
    <main className="h-full w-full grid grid-cols-[55fr_45fr]">
      <section className="relative h-full">
        <SpectatorView onReady={onReady} />
        <div className="absolute left-3 top-3 text-xs uppercase tracking-widest text-neutral-400">Vue spectateur</div>
      </section>
      <aside className="overflow-auto border-l border-neutral-800 p-4 text-sm text-neutral-400">
        <AgentViews />
      </aside>
    </main>
  );
}
