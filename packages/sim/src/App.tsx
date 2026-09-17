import { useCallback } from 'react';
import type { Object3D } from 'three';
import { buildPlantMesh } from './plant/buildPlantMesh';
import { generatePlant } from './plant/generatePlant';
import { SpectatorView } from './three/SpectatorView';

const SEED = 20260917;

export function App() {
  const build = useCallback((): Object3D[] => [buildPlantMesh(generatePlant(SEED))], []);
  return (
    <main className="h-full w-full grid grid-cols-[55fr_45fr]">
      <section className="relative h-full">
        <SpectatorView build={build} />
        <div className="absolute left-3 top-3 text-xs uppercase tracking-widest text-neutral-400">Vue spectateur</div>
      </section>
      <aside className="border-l border-neutral-800 p-4 text-sm text-neutral-400">Vues de l'agent (Étape 2)</aside>
    </main>
  );
}
