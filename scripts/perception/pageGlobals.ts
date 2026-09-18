/**
 * Ce que la page expose sur `window.__tomato` en mode développement (voir `packages/sim/src/App.tsx`).
 * Retypé ici, comme dans `scripts/video/lib/pageGlobals.ts` : `scripts/perception` est un programme
 * TypeScript séparé de `packages/sim` et n'utilise que le strict nécessaire à la génération du jeu.
 */

export type CameraName = 'top' | 'front' | 'side';
export type LabelName = 'ripe' | 'unripe';

export interface SampleLabel {
  readonly tomatoId: number;
  readonly label: LabelName;
  /** [x, y, w, h] en pixels de l'image rendue. */
  readonly bbox: readonly [number, number, number, number];
}

export interface DatasetSample {
  readonly camera: CameraName;
  readonly widthPx: number;
  readonly heightPx: number;
  readonly pngBase64: string;
  readonly labels: readonly SampleLabel[];
}

export interface TomatoGlobal {
  readonly runtime: { applyNow(action: unknown): void };
  readonly renderViews?: (cameras: readonly string[]) => Promise<unknown>;
  /** Exposés par Vite en mode dev seulement : la génération exige donc `npm run dev`, pas `preview`. */
  readonly sample?: (camera: CameraName) => DatasetSample | null;
}

declare global {
  interface Window {
    __tomato?: TomatoGlobal;
  }
}

export {};
