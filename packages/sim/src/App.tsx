import { useCallback } from 'react';
import type { Object3D } from 'three';
import { SpectatorView } from './three/SpectatorView';

export function App() {
  const build = useCallback((): Object3D[] => [], []);
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
