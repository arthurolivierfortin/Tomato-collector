import { useCallback } from 'react';
import { createDefaultWorld } from '@tomato/shared';
import { createRuntime, type SimRuntime } from './core/runtime';
import type { SimModule } from './core/module';
import { buildPlantMesh } from './plant/buildPlantMesh';
import { generatePlant } from './plant/generatePlant';
import { robotModule } from './robot/robotModule';
import { SpectatorView } from './three/SpectatorView';
import type { SceneHandle } from './three/createScene';

const SEED = 20260917;

/** Modules de la sim, dans l'ordre de dispatch des actions. Remplis par M1 (plant), M2 (robot), M3 (cameras). */
const MODULES: SimModule[] = [robotModule];

declare global {
  interface Window {
    __tomato?: { runtime: SimRuntime };
  }
}

export function App() {
  const onReady = useCallback((scene: SceneHandle) => {
    // Plant statique de l'Étape 1 ; M1 le remplace par un module.
    scene.addObject(buildPlantMesh(generatePlant(SEED)));
    let stopFrames: (() => void) | null = null;
    void createRuntime(createDefaultWorld(SEED), scene, MODULES).then((runtime) => {
      window.__tomato = { runtime };
      stopFrames = scene.onFrame((dt) => runtime.step(dt));
    });
    return () => stopFrames?.();
  }, []);

  return (
    <main className="h-full w-full grid grid-cols-[55fr_45fr]">
      <section className="relative h-full">
        <SpectatorView onReady={onReady} />
        <div className="absolute left-3 top-3 text-xs uppercase tracking-widest text-neutral-400">Vue spectateur</div>
      </section>
      <aside className="border-l border-neutral-800 p-4 text-sm text-neutral-400">Vues de l'agent (Étape 2)</aside>
    </main>
  );
}
