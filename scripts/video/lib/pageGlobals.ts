/**
 * Ce que la page expose sur `window.__tomato` en mode développement (voir `packages/sim/src/App.tsx`).
 * Retypé ici plutôt qu'importé : `scripts/video` est un programme TypeScript séparé de `packages/sim`,
 * et seul le strict nécessaire au pilotage est utilisé.
 */

export interface PageScriptEntry {
  readonly atMs: number;
  readonly message: unknown;
}

export interface TomatoGlobal {
  readonly runtime: { readonly ctx: { readonly store: { get(): unknown } }; applyNow(action: unknown): void };
  readonly renderViews?: (cameras: readonly string[]) => Promise<unknown>;
  /** Exposés par Vite en mode dev seulement : le pilote exige donc `npm run dev`, pas `preview`. */
  readonly fakeBridge?: (script: readonly PageScriptEntry[], speed?: number) => unknown;
  readonly attachBridge?: (bridge: unknown) => void;
  readonly stopReplay?: () => void;
  readonly demoScript?: (views: unknown, state: unknown) => PageScriptEntry[];
}

declare global {
  interface Window {
    __tomato?: TomatoGlobal;
  }
}

export {};
