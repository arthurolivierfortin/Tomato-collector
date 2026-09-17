# Étape 1 — Fondations : plan d'implémentation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Mettre en place le monorepo, les contrats partagés figés, une scène 3D minimale avec un plant procédural v1, le README de dev, le cycle de développement dans `.claude/` et les issues GitHub, pour que les modules M1 à M7 puissent être construits en parallèle.

**Architecture:** Monorepo npm workspaces avec trois packages (`shared`, `sim`, `server`). `shared` contient uniquement des types, des schémas zod et des fonctions pures (machine à états, fabrique du monde par défaut). `sim` est une page Vite + React + Three.js. `server` est un package Node vide mais outillé. Tout est en centimètres et degrés, repère monde Z vers le haut, converti vers le repère Three.js (Y vers le haut) par une seule fonction.

**Tech Stack:** Node 22, npm workspaces, TypeScript 5 strict, ESLint (typescript-eslint flat config), Vitest 3, Vite 6, React 19, Tailwind 4 (`@tailwindcss/vite`), Three.js, zod 3.25 (API v3), Playwright (captures), gh CLI.

**Spec:** `docs/superpowers/specs/2026-09-17-tomato-harvest-demo-design.md`

## Global Constraints

- Windows 11 sans toolchain native : uniquement Node 22, npm, TypeScript, WASM. Pas de compilation C++ (donc pas de `node-canvas`, pas de `headless-gl`).
- Unités partout : centimètres et degrés. Repère monde : X vers la droite, Y vers l'arrière (profondeur), Z vers le haut, origine au pied du plant.
- Dans Three.js : 1 unité = 1 cm. Conversion monde → Three : `(x, y, z) → (x, z, -y)`.
- Phases du système : `idle`, `detected`, `harvesting`, `cutting`, `falling`, `harvested`, `missed`, `aborted`.
- Caméras de l'agent : `top` (regarde −Z, axes X/Y), `front` (regarde +Y, axes X/Z), `side` (regarde −X, axes Y/Z), toutes orthographiques.
- Outils MCP : `get_status`, `get_views`, `move_camera`, `move_scissors`, `rotate_scissors`, `open_scissors`, `cut`, `move_basket`, `report`. Les erreurs sont des retours structurés, jamais des exceptions.
- Gates par PR : `npm run lint`, `npm run typecheck`, `npm test`, `npm run build`.
- L'Étape 1 est exécutée en fil principal et commitée directement sur `main` (le cycle builder → judge n'existe pas encore). À partir de l'Étape 2, tout passe par PR.
- Condition de passage de l'Étape 1 : gates verts, capture de scène approuvée par le propriétaire, contrats de `shared` mergés.

---

## Structure de fichiers

```
package.json                      workspaces, scripts agrégés
tsconfig.base.json                options TS strictes partagées
eslint.config.mjs                 flat config typescript-eslint
vitest.config.ts                  projets = packages/*
.gitignore, .editorconfig
README.md                         README de développement
docs/STATUS.md                    étape courante, modules, état
docs/superpowers/specs/...        spec (existe), checklist de l'Étape 1
.claude/agents/{builder,judge,visual-checker,cleaner}.md
.claude/skills/{cycle,plan,status,checkpoint}/SKILL.md
.claude/settings.json

packages/shared/
  package.json, tsconfig.json, vitest.config.ts
  src/index.ts                    barrel
  src/units.ts                    Vec2, Vec3, helpers d'angle
  src/phases.ts                   Phase, transitions, canTransition, transition
  src/world.ts                    CameraId, Tomato, poses, Limits, WorldState, createDefaultWorld
  src/actions.ts                  SimAction, ActionResult, ActionErrorCode
  src/views.ts                    ViewImage, ViewsPayload, ViewsResult
  src/messages.ts                 messages WebSocket sim ↔ serveur ↔ dashboard
  src/tools.ts                    schémas zod + descriptions des 9 outils MCP
  src/*.test.ts

packages/sim/
  package.json, tsconfig.json, vite.config.ts, vitest.config.ts, index.html
  playwright.config.ts, tests/scene.spec.ts        capture de la scène
  src/main.tsx                    point d'entrée React
  src/App.tsx                     page plein écran avec la vue spectateur
  src/styles.css                  Tailwind
  src/three/frame.ts              worldToThree / threeToWorld
  src/three/createScene.ts        renderer, scène, lumières, sol, caméra spectateur, OrbitControls
  src/three/SpectatorView.tsx     composant React qui monte createScene dans un canvas
  src/plant/random.ts             PRNG déterministe (mulberry32)
  src/plant/generatePlant.ts      seed → PlantSpec (pur)
  src/plant/buildPlantMesh.ts     PlantSpec → THREE.Group
  src/plant/leafTexture.ts        texture alpha de feuille dessinée sur un canvas
  src/**/*.test.ts

packages/server/
  package.json, tsconfig.json, vitest.config.ts
  src/index.ts                    export VERSION + point d'entrée à compléter en M5
  src/index.test.ts
```

---

### Task 1: Monorepo et tooling

**Files:**
- Create: `package.json`, `tsconfig.base.json`, `eslint.config.mjs`, `vitest.config.ts`, `.gitignore`, `.editorconfig`
- Create: `packages/shared/package.json`, `packages/shared/tsconfig.json`, `packages/shared/vitest.config.ts`, `packages/shared/src/index.ts`
- Create: `packages/server/package.json`, `packages/server/tsconfig.json`, `packages/server/vitest.config.ts`, `packages/server/src/index.ts`, `packages/server/src/index.test.ts`

**Interfaces:**
- Produces: les scripts racine `lint`, `typecheck`, `test`, `build` que tous les gates utilisent ; l'alias de package `@tomato/shared`.

- [ ] **Step 1: Fichiers racine**

`package.json` :

```json
{
  "name": "tomato-collector",
  "private": true,
  "type": "module",
  "workspaces": ["packages/*"],
  "engines": { "node": ">=22" },
  "scripts": {
    "lint": "eslint .",
    "typecheck": "npm run typecheck --workspaces --if-present",
    "test": "vitest run",
    "test:watch": "vitest",
    "build": "npm run build --workspaces --if-present",
    "dev:sim": "npm run dev -w @tomato/sim",
    "shot": "npm run shot -w @tomato/sim"
  },
  "devDependencies": {
    "@eslint/js": "^9.0.0",
    "eslint": "^9.0.0",
    "typescript": "^5.6.0",
    "typescript-eslint": "^8.0.0",
    "vitest": "^3.2.0"
  }
}
```

`tsconfig.base.json` :

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "noImplicitOverride": true,
    "exactOptionalPropertyTypes": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "isolatedModules": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true
  }
}
```

`eslint.config.mjs` :

```js
import js from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['**/dist/**', '**/node_modules/**', 'data/**', '**/playwright-report/**', '**/test-results/**'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    rules: {
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/consistent-type-imports': 'error',
    },
  },
);
```

`vitest.config.ts` :

```ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    projects: ['packages/*'],
  },
});
```

`.gitignore` :

```
node_modules/
dist/
data/episodes/
data/shots/
data/*.json
test-results/
playwright-report/
*.log
.env*
!.env.example
```

`.editorconfig` :

```
root = true
[*]
end_of_line = lf
insert_final_newline = true
charset = utf-8
indent_style = space
indent_size = 2
```

- [ ] **Step 2: Package `shared`**

`packages/shared/package.json` :

```json
{
  "name": "@tomato/shared",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "main": "./src/index.ts",
  "types": "./src/index.ts",
  "exports": { ".": "./src/index.ts" },
  "scripts": {
    "typecheck": "tsc --noEmit",
    "build": "tsc --noEmit"
  },
  "dependencies": { "zod": "^3.25.0" }
}
```

`packages/shared/tsconfig.json` :

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": { "noEmit": true, "types": ["node"] },
  "include": ["src"]
}
```

`packages/shared/vitest.config.ts` :

```ts
import { defineConfig } from 'vitest/config';
export default defineConfig({ test: { name: 'shared', environment: 'node', include: ['src/**/*.test.ts'] } });
```

`packages/shared/src/index.ts` (barrel, sera complété par les tâches suivantes) :

```ts
export * from './units';
```

- [ ] **Step 3: Package `server` minimal avec un test réel**

`packages/server/package.json` :

```json
{
  "name": "@tomato/server",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "scripts": {
    "typecheck": "tsc --noEmit",
    "build": "tsc --noEmit"
  },
  "dependencies": { "@tomato/shared": "*" }
}
```

`packages/server/tsconfig.json` : identique à celui de `shared` (extends base, `noEmit`, `types: ["node"]`, `include: ["src"]`).

`packages/server/vitest.config.ts` : identique à celui de `shared` avec `name: 'server'`.

`packages/server/src/index.ts` :

```ts
export const VERSION = '0.1.0';
```

`packages/server/src/index.test.ts` :

```ts
import { describe, expect, it } from 'vitest';
import { VERSION } from './index';

describe('server package', () => {
  it('exposes a semver version', () => {
    expect(VERSION).toMatch(/^\d+\.\d+\.\d+$/);
  });
});
```

- [ ] **Step 4: Installer et vérifier les gates**

Run:
```bash
npm install
npm install -D @types/node -w @tomato/shared -w @tomato/server
npm run lint && npm run typecheck && npm test && npm run build
```
Expected: les quatre commandes sortent en 0 ; vitest rapporte 1 test passé (server).

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "chore: monorepo npm workspaces, tooling TS/ESLint/Vitest, packages shared et server"
```

---

### Task 2: `shared/units` et machine à états des phases

**Files:**
- Create: `packages/shared/src/units.ts`, `packages/shared/src/phases.ts`, `packages/shared/src/phases.test.ts`
- Modify: `packages/shared/src/index.ts`

**Interfaces:**
- Produces: `Vec2`, `Vec3`, `degToRad`, `radToDeg`, `Phase`, `PHASES`, `PHASE_TRANSITIONS`, `canTransition(from, to)`, `transition(from, to)`.

- [ ] **Step 1: Écrire `units.ts`**

```ts
/** Vecteur 2D en centimètres (ou en pixels selon le contexte, toujours documenté). */
export type Vec2 = readonly [number, number];
/** Vecteur 3D en centimètres, repère monde : X droite, Y arrière, Z haut. */
export type Vec3 = readonly [number, number, number];

export const degToRad = (deg: number): number => (deg * Math.PI) / 180;
export const radToDeg = (rad: number): number => (rad * 180) / Math.PI;

export const vadd = (a: Vec3, b: Vec3): Vec3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
export const vsub = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
export const vscale = (a: Vec3, s: number): Vec3 => [a[0] * s, a[1] * s, a[2] * s];
export const vdot = (a: Vec3, b: Vec3): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
export const vlen = (a: Vec3): number => Math.sqrt(vdot(a, a));
export const vnorm = (a: Vec3): Vec3 => {
  const l = vlen(a);
  return l === 0 ? [0, 0, 0] : vscale(a, 1 / l);
};
```

- [ ] **Step 2: Test de la machine à états (échoue)**

`packages/shared/src/phases.test.ts` :

```ts
import { describe, expect, it } from 'vitest';
import { PHASES, canTransition, transition } from './phases';

describe('phases', () => {
  it('lists the eight phases of the spec in order', () => {
    expect(PHASES).toEqual([
      'idle', 'detected', 'harvesting', 'cutting', 'falling', 'harvested', 'missed', 'aborted',
    ]);
  });

  it('follows the nominal harvest path', () => {
    let p = transition('idle', 'detected');
    p = transition(p, 'harvesting');
    p = transition(p, 'cutting');
    p = transition(p, 'falling');
    p = transition(p, 'harvested');
    expect(transition(p, 'idle')).toBe('idle');
  });

  it('lets a failed cut go back to harvesting', () => {
    expect(canTransition('cutting', 'harvesting')).toBe(true);
  });

  it('can abort from detected, harvesting and cutting but not from falling', () => {
    expect(canTransition('detected', 'aborted')).toBe(true);
    expect(canTransition('harvesting', 'aborted')).toBe(true);
    expect(canTransition('cutting', 'aborted')).toBe(true);
    expect(canTransition('falling', 'aborted')).toBe(false);
  });

  it('rejects skipping phases', () => {
    expect(canTransition('idle', 'cutting')).toBe(false);
    expect(() => transition('idle', 'cutting')).toThrow(/idle -> cutting/);
  });

  it('terminal phases only return to idle', () => {
    for (const p of ['harvested', 'missed', 'aborted'] as const) {
      expect(canTransition(p, 'idle')).toBe(true);
      expect(canTransition(p, 'detected')).toBe(false);
    }
  });
});
```

- [ ] **Step 3: Vérifier l'échec**

Run: `npx vitest run packages/shared/src/phases.test.ts`
Expected: FAIL, module `./phases` introuvable.

- [ ] **Step 4: Écrire `phases.ts`**

```ts
export const PHASES = [
  'idle', 'detected', 'harvesting', 'cutting', 'falling', 'harvested', 'missed', 'aborted',
] as const;
export type Phase = (typeof PHASES)[number];

export const PHASE_TRANSITIONS: Readonly<Record<Phase, readonly Phase[]>> = {
  idle: ['detected'],
  detected: ['harvesting', 'aborted'],
  harvesting: ['cutting', 'aborted'],
  cutting: ['falling', 'harvesting', 'aborted'],
  falling: ['harvested', 'missed'],
  harvested: ['idle'],
  missed: ['idle'],
  aborted: ['idle'],
};

export function canTransition(from: Phase, to: Phase): boolean {
  return PHASE_TRANSITIONS[from].includes(to);
}

export function transition(from: Phase, to: Phase): Phase {
  if (!canTransition(from, to)) {
    throw new Error(`Invalid phase transition ${from} -> ${to}`);
  }
  return to;
}
```

Ajouter dans `index.ts` : `export * from './phases';`

- [ ] **Step 5: Vérifier le succès**

Run: `npx vitest run packages/shared/src/phases.test.ts`
Expected: PASS, 6 tests.

- [ ] **Step 6: Commit**

```bash
git add packages/shared/src
git commit -m "feat(shared): unités et machine à états des phases"
```

---

### Task 3: `shared/world` — état du monde et monde par défaut

**Files:**
- Create: `packages/shared/src/world.ts`, `packages/shared/src/world.test.ts`
- Modify: `packages/shared/src/index.ts`

**Interfaces:**
- Consumes: `Vec2`, `Vec3`, `Phase`.
- Produces: `CameraId`, `CAMERA_IDS`, `TomatoState`, `Tomato`, `CameraPose`, `ScissorsPose`, `BasketPose`, `Limits`, `WorldState`, `createDefaultWorld(seed)`, `DEFAULT_LIMITS`.

- [ ] **Step 1: Test (échoue)**

`packages/shared/src/world.test.ts` :

```ts
import { describe, expect, it } from 'vitest';
import { CAMERA_IDS, createDefaultWorld } from './world';

describe('createDefaultWorld', () => {
  const w = createDefaultWorld(42);

  it('starts idle, unpaused, at t=0 with the given seed', () => {
    expect(w.phase).toBe('idle');
    expect(w.paused).toBe(false);
    expect(w.simTimeS).toBe(0);
    expect(w.seed).toBe(42);
    expect(w.targetTomatoId).toBeNull();
    expect(w.tomatoes).toEqual([]);
  });

  it('has the three orthographic cameras on their rails', () => {
    expect(CAMERA_IDS).toEqual(['top', 'front', 'side']);
    expect(w.cameras.top.positionCm[2]).toBeGreaterThan(80);
    expect(w.cameras.front.positionCm[1]).toBeLessThan(0);
    expect(w.cameras.side.positionCm[0]).toBeGreaterThan(0);
    for (const id of CAMERA_IDS) {
      expect(w.cameras[id].widthCm).toBeGreaterThan(0);
      expect(w.cameras[id].pxPerCm).toBeCloseTo(800 / w.cameras[id].widthCm);
    }
  });

  it('places the basket under the plant within its rail', () => {
    const [x, y] = w.basket.centerCm;
    expect(x).toBeGreaterThanOrEqual(w.limits.basketRailCm.x[0]);
    expect(x).toBeLessThanOrEqual(w.limits.basketRailCm.x[1]);
    expect(y).toBeGreaterThanOrEqual(w.limits.basketRailCm.y[0]);
    expect(y).toBeLessThanOrEqual(w.limits.basketRailCm.y[1]);
    expect(w.basket.sizeCm).toEqual([20, 20]);
    expect(w.basket.depthCm).toBe(10);
  });

  it('starts with closed scissors away from the plant', () => {
    expect(w.scissors.openingDeg).toBe(0);
    expect(Math.hypot(...w.scissors.cutPointCm)).toBeGreaterThan(30);
  });
});
```

- [ ] **Step 2: Vérifier l'échec**

Run: `npx vitest run packages/shared/src/world.test.ts`
Expected: FAIL, module `./world` introuvable.

- [ ] **Step 3: Écrire `world.ts`**

```ts
import type { Phase } from './phases';
import type { Vec2, Vec3 } from './units';

export const CAMERA_IDS = ['top', 'front', 'side'] as const;
export type CameraId = (typeof CAMERA_IDS)[number];

export type TomatoState = 'unripe' | 'turning' | 'ripe';

export interface Tomato {
  id: number;
  state: TomatoState;
  /** 0 = vert, 1 = mûr. */
  ripeness: number;
  positionCm: Vec3;
  radiusCm: number;
  /** Pédoncule : de la branche (from) vers le fruit (to). */
  stem: { fromCm: Vec3; toCm: Vec3 };
  /** false une fois coupée. */
  attached: boolean;
  /** Fraction visible (0..1) dans chaque vue, estimée par la sim. */
  visibleIn: Record<CameraId, number>;
}

export interface CameraPose {
  positionCm: Vec3;
  yawDeg: number;
  tiltDeg: number;
  /** Largeur du champ orthographique, en cm. */
  widthCm: number;
  /** Dérivé : 800 px / widthCm. */
  pxPerCm: number;
}

export interface ScissorsPose {
  cutPointCm: Vec3;
  yawDeg: number;
  pitchDeg: number;
  rollDeg: number;
  /** 0 = fermés. */
  openingDeg: number;
  bladeAxis: Vec3;
  bladeNormal: Vec3;
}

export interface BasketPose {
  centerCm: Vec3;
  sizeCm: Vec2;
  depthCm: number;
}

export interface Range {
  x: Vec2;
  y: Vec2;
  z: Vec2;
}

export interface Limits {
  scissorsBaseCm: Vec3;
  scissorsReachCm: number;
  basketRailCm: { x: Vec2; y: Vec2 };
  cameraRailsCm: Record<CameraId, Range>;
  cameraPivotDeg: number;
}

export interface WorldState {
  seed: number;
  simTimeS: number;
  timeScale: number;
  paused: boolean;
  phase: Phase;
  targetTomatoId: number | null;
  tomatoes: Tomato[];
  scissors: ScissorsPose;
  basket: BasketPose;
  cameras: Record<CameraId, CameraPose>;
  limits: Limits;
}

export const VIEW_SIZE_PX = 800;

export const DEFAULT_LIMITS: Limits = {
  scissorsBaseCm: [70, -40, 0],
  scissorsReachCm: 110,
  basketRailCm: { x: [-40, 40], y: [-40, 40] },
  cameraRailsCm: {
    top: { x: [-40, 40], y: [-40, 40], z: [90, 160] },
    front: { x: [-40, 40], y: [-160, -70], z: [10, 100] },
    side: { x: [70, 160], y: [-40, 40], z: [10, 100] },
  },
  cameraPivotDeg: 25,
};

function camera(positionCm: Vec3, widthCm: number): CameraPose {
  return { positionCm, yawDeg: 0, tiltDeg: 0, widthCm, pxPerCm: VIEW_SIZE_PX / widthCm };
}

export function createDefaultWorld(seed: number): WorldState {
  return {
    seed,
    simTimeS: 0,
    timeScale: 1,
    paused: false,
    phase: 'idle',
    targetTomatoId: null,
    tomatoes: [],
    scissors: {
      cutPointCm: [45, -35, 60],
      yawDeg: 0,
      pitchDeg: 0,
      rollDeg: 0,
      openingDeg: 0,
      bladeAxis: [-1, 0, 0],
      bladeNormal: [0, 0, 1],
    },
    basket: { centerCm: [0, 0, 5], sizeCm: [20, 20], depthCm: 10 },
    cameras: {
      top: camera([0, 0, 120], 100),
      front: camera([0, -100, 45], 100),
      side: camera([100, 0, 45], 100),
    },
    limits: DEFAULT_LIMITS,
  };
}
```

Ajouter dans `index.ts` : `export * from './world';`

- [ ] **Step 4: Vérifier le succès**

Run: `npx vitest run packages/shared/src/world.test.ts`
Expected: PASS, 4 tests.

- [ ] **Step 5: Commit**

```bash
git add packages/shared/src
git commit -m "feat(shared): état du monde, poses, limites et monde par défaut"
```

---

### Task 4: `shared/actions` — actions de la sim et résultats

**Files:**
- Create: `packages/shared/src/actions.ts`, `packages/shared/src/actions.test.ts`
- Modify: `packages/shared/src/index.ts`

**Interfaces:**
- Consumes: `CameraId`, `WorldState`.
- Produces: `MoveMode`, `SimAction`, `ActionErrorCode`, `ActionResult`, `ok(state, message)`, `fail(state, code, message, details?)`.

- [ ] **Step 1: Test (échoue)**

`packages/shared/src/actions.test.ts` :

```ts
import { describe, expect, it } from 'vitest';
import { fail, ok } from './actions';
import { createDefaultWorld } from './world';

describe('action results', () => {
  const state = createDefaultWorld(1);

  it('ok carries the message and the resulting state', () => {
    const r = ok(state, 'stem_cut');
    expect(r).toEqual({ ok: true, message: 'stem_cut', state });
  });

  it('fail carries a code, a message and optional numeric details', () => {
    const r = fail(state, 'misaligned', 'blade line is 20 deg from perpendicular', {
      distanceCm: 1.2,
      angleDeg: 20,
    });
    expect(r.ok).toBe(false);
    if (r.ok) throw new Error('unreachable');
    expect(r.error).toBe('misaligned');
    expect(r.details).toEqual({ distanceCm: 1.2, angleDeg: 20 });
  });
});
```

- [ ] **Step 2: Vérifier l'échec**

Run: `npx vitest run packages/shared/src/actions.test.ts`
Expected: FAIL, module `./actions` introuvable.

- [ ] **Step 3: Écrire `actions.ts`**

```ts
import type { CameraId, WorldState } from './world';

export type MoveMode = 'relative' | 'absolute';

export type SimAction =
  | { type: 'move_camera'; camera: CameraId; dx?: number; dy?: number; dz?: number; yaw?: number; tilt?: number; zoom?: number }
  | { type: 'move_scissors'; x: number; y: number; z: number; mode: MoveMode }
  | { type: 'rotate_scissors'; yaw?: number; pitch?: number; roll?: number; mode: MoveMode }
  | { type: 'open_scissors' }
  | { type: 'cut' }
  | { type: 'move_basket'; x: number; y: number; mode: MoveMode }
  | { type: 'set_target'; tomatoId: number | null }
  | { type: 'set_time_scale'; scale: number }
  | { type: 'set_paused'; paused: boolean }
  | { type: 'ripen_next' }
  | { type: 'new_plant'; seed?: number };

export type ActionErrorCode =
  | 'out_of_reach'
  | 'collision'
  | 'out_of_rail'
  | 'nothing_between_blades'
  | 'leaf_cut'
  | 'misaligned'
  | 'invalid_argument'
  | 'not_available';

export type ActionResult =
  | { ok: true; message: string; state: WorldState }
  | { ok: false; error: ActionErrorCode; message: string; details?: Record<string, number | string>; state: WorldState };

export function ok(state: WorldState, message: string): ActionResult {
  return { ok: true, message, state };
}

export function fail(
  state: WorldState,
  error: ActionErrorCode,
  message: string,
  details?: Record<string, number | string>,
): ActionResult {
  return details === undefined ? { ok: false, error, message, state } : { ok: false, error, message, details, state };
}
```

Ajouter dans `index.ts` : `export * from './actions';`

- [ ] **Step 4: Vérifier le succès**

Run: `npx vitest run packages/shared/src/actions.test.ts`
Expected: PASS, 2 tests.

- [ ] **Step 5: Commit**

```bash
git add packages/shared/src
git commit -m "feat(shared): actions de simulation et résultats structurés"
```

---

### Task 5: `shared/views` et `shared/messages` — contrat des vues et messages WebSocket

**Files:**
- Create: `packages/shared/src/views.ts`, `packages/shared/src/messages.ts`, `packages/shared/src/messages.test.ts`
- Modify: `packages/shared/src/index.ts`

**Interfaces:**
- Consumes: `CameraId`, `CameraPose`, `ScissorsPose`, `BasketPose`, `Limits`, `Phase`, `Tomato`, `SimAction`, `ActionResult`, `WorldState`.
- Produces: `ViewImage`, `TomatoView`, `ViewsPayload`, `ViewsResult`, `SimEvent`, `SimToServer`, `ServerToSim`, `ServerToDashboard`, `ClientHello`, `parseMessage(raw)`.

- [ ] **Step 1: Écrire `views.ts`**

```ts
import type { Phase } from './phases';
import type { Vec3 } from './units';
import type { BasketPose, CameraId, CameraPose, Limits, ScissorsPose, TomatoState } from './world';

export interface ViewImage {
  camera: CameraId;
  /** PNG encodé en base64, sans préfixe data:. */
  pngBase64: string;
  widthPx: number;
  heightPx: number;
}

export interface TomatoView {
  id: number;
  state: TomatoState;
  ripeness: number;
  positionCm: Vec3;
  stem: { fromCm: Vec3; toCm: Vec3 };
  visibleIn: Record<CameraId, number>;
}

/** Le JSON qui accompagne les images (spec section 4.5). */
export interface ViewsPayload {
  simTimeS: number;
  phase: Phase;
  targetTomatoId: number | null;
  tomatoes: TomatoView[];
  scissors: ScissorsPose;
  basket: BasketPose;
  cameras: Record<CameraId, CameraPose>;
  limits: Limits;
}

export interface ViewsResult {
  images: ViewImage[];
  json: ViewsPayload;
}
```

- [ ] **Step 2: Test de `parseMessage` (échoue)**

`packages/shared/src/messages.test.ts` :

```ts
import { describe, expect, it } from 'vitest';
import { parseMessage } from './messages';

describe('parseMessage', () => {
  it('accepts a hello from the sim', () => {
    const m = parseMessage(JSON.stringify({ type: 'hello', role: 'sim' }));
    expect(m).toEqual({ type: 'hello', role: 'sim' });
  });

  it('rejects non-JSON and messages without a string type', () => {
    expect(parseMessage('not json')).toBeNull();
    expect(parseMessage(JSON.stringify({ role: 'sim' }))).toBeNull();
    expect(parseMessage(JSON.stringify({ type: 42 }))).toBeNull();
  });
});
```

- [ ] **Step 3: Vérifier l'échec**

Run: `npx vitest run packages/shared/src/messages.test.ts`
Expected: FAIL, module `./messages` introuvable.

- [ ] **Step 4: Écrire `messages.ts`**

```ts
import type { ActionResult, SimAction } from './actions';
import type { Phase } from './phases';
import type { ViewsResult } from './views';
import type { CameraId, WorldState } from './world';

export type ClientRole = 'sim' | 'dashboard';

export interface ClientHello {
  type: 'hello';
  role: ClientRole;
}

export type DetectorKind = 'yolo' | 'hsv';

export type SimEvent =
  | { type: 'ripe_detected'; tomatoId: number; detector: DetectorKind; confidence: number }
  | { type: 'tomato_landed'; tomatoId: number; inBasket: boolean }
  | { type: 'plant_regenerated'; seed: number };

/** Navigateur (rôle sim) → serveur. */
export type SimToServer =
  | ClientHello
  | { type: 'state'; state: WorldState }
  | { type: 'sim_event'; event: SimEvent }
  | { type: 'action_result'; requestId: string; result: ActionResult }
  | { type: 'views_result'; requestId: string; result: ViewsResult };

/** Serveur → navigateur (rôle sim). */
export type ServerToSim =
  | { type: 'apply_action'; requestId: string; action: SimAction }
  | { type: 'render_views'; requestId: string; cameras: CameraId[] };

export type BlockId = 'simulation' | 'perception' | 'server' | 'agent' | 'dashboard';

/** Serveur → dashboard (et vers la page sim, qui est aussi le dashboard). */
export type ServerToDashboard =
  | { type: 'snapshot'; state: WorldState; phase: Phase; episodeId: string | null }
  | { type: 'phase'; phase: Phase; reason: string }
  | { type: 'episode_start'; episodeId: string; tomatoId: number; sessionResumed: boolean }
  | { type: 'episode_end'; episodeId: string; outcome: 'harvested' | 'missed' | 'aborted'; note: string; toolCalls: number; costUsd: number; durationMs: number }
  | { type: 'agent_text'; episodeId: string; text: string }
  | { type: 'tool_call_start'; episodeId: string; callId: string; tool: string; args: Record<string, unknown> }
  | { type: 'tool_call_result'; episodeId: string; callId: string; ok: boolean; summary: string; durationMs: number }
  | { type: 'views'; episodeId: string | null; result: ViewsResult }
  | { type: 'sim_event'; event: SimEvent }
  | { type: 'block_activity'; from: BlockId; to: BlockId; label: string };

export type AnyMessage = SimToServer | ServerToSim | ServerToDashboard;

/** Décode un message brut ; retourne null si ce n'est pas un objet JSON avec un `type` string. */
export function parseMessage(raw: string): AnyMessage | null {
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return null;
  }
  if (typeof value !== 'object' || value === null) return null;
  const type = (value as { type?: unknown }).type;
  if (typeof type !== 'string') return null;
  return value as AnyMessage;
}
```

Ajouter dans `index.ts` : `export * from './views'; export * from './messages';`

- [ ] **Step 5: Vérifier le succès**

Run: `npx vitest run packages/shared/src/messages.test.ts`
Expected: PASS, 2 tests.

- [ ] **Step 6: Commit**

```bash
git add packages/shared/src
git commit -m "feat(shared): contrat des vues annotées et messages WebSocket"
```

---

### Task 6: `shared/tools` — schémas zod et descriptions des 9 outils MCP

**Files:**
- Create: `packages/shared/src/tools.ts`, `packages/shared/src/tools.test.ts`
- Modify: `packages/shared/src/index.ts`

**Interfaces:**
- Produces: `TOOL_NAMES`, `ToolName`, `ToolSchemas` (un schéma zod par outil), `ToolInput<N>`, `TOOL_DESCRIPTIONS`, `MAX_TOOL_CALLS_PER_EPISODE = 40`.

- [ ] **Step 1: Test (échoue)**

`packages/shared/src/tools.test.ts` :

```ts
import { describe, expect, it } from 'vitest';
import { MAX_TOOL_CALLS_PER_EPISODE, TOOL_DESCRIPTIONS, TOOL_NAMES, ToolSchemas } from './tools';

describe('MCP tool schemas', () => {
  it('declares exactly the nine tools of the spec', () => {
    expect(TOOL_NAMES).toEqual([
      'get_status', 'get_views', 'move_camera', 'move_scissors', 'rotate_scissors',
      'open_scissors', 'cut', 'move_basket', 'report',
    ]);
    for (const name of TOOL_NAMES) {
      expect(TOOL_DESCRIPTIONS[name].length).toBeGreaterThan(40);
    }
    expect(MAX_TOOL_CALLS_PER_EPISODE).toBe(40);
  });

  it('validates move_scissors and rejects a missing mode', () => {
    expect(ToolSchemas.move_scissors.safeParse({ x: 1, y: 2, z: 3, mode: 'relative' }).success).toBe(true);
    expect(ToolSchemas.move_scissors.safeParse({ x: 1, y: 2, z: 3 }).success).toBe(false);
  });

  it('limits get_views to the three known cameras', () => {
    expect(ToolSchemas.get_views.safeParse({}).success).toBe(true);
    expect(ToolSchemas.get_views.safeParse({ cameras: ['top', 'side'] }).success).toBe(true);
    expect(ToolSchemas.get_views.safeParse({ cameras: ['back'] }).success).toBe(false);
  });

  it('requires an outcome and bounds the note of report', () => {
    expect(ToolSchemas.report.safeParse({ outcome: 'harvested', note: 'ok' }).success).toBe(true);
    expect(ToolSchemas.report.safeParse({ outcome: 'done', note: 'ok' }).success).toBe(false);
    expect(ToolSchemas.report.safeParse({ outcome: 'missed', note: 'x'.repeat(501) }).success).toBe(false);
  });
});
```

- [ ] **Step 2: Vérifier l'échec**

Run: `npx vitest run packages/shared/src/tools.test.ts`
Expected: FAIL, module `./tools` introuvable.

- [ ] **Step 3: Écrire `tools.ts`**

```ts
import { z } from 'zod';
import { CAMERA_IDS } from './world';

export const MAX_TOOL_CALLS_PER_EPISODE = 40;

export const CameraIdSchema = z.enum(CAMERA_IDS);
export const MoveModeSchema = z.enum(['relative', 'absolute']);

export const ToolSchemas = {
  get_status: z.object({}),
  get_views: z.object({
    cameras: z.array(CameraIdSchema).min(1).max(3).optional(),
  }),
  move_camera: z.object({
    camera: CameraIdSchema,
    dx: z.number().optional(),
    dy: z.number().optional(),
    dz: z.number().optional(),
    yaw: z.number().optional(),
    tilt: z.number().optional(),
    zoom: z.number().positive().optional(),
  }),
  move_scissors: z.object({
    x: z.number(),
    y: z.number(),
    z: z.number(),
    mode: MoveModeSchema,
  }),
  rotate_scissors: z.object({
    yaw: z.number().optional(),
    pitch: z.number().optional(),
    roll: z.number().optional(),
    mode: MoveModeSchema,
  }),
  open_scissors: z.object({}),
  cut: z.object({}),
  move_basket: z.object({
    x: z.number(),
    y: z.number(),
    mode: MoveModeSchema,
  }),
  report: z.object({
    outcome: z.enum(['harvested', 'missed', 'aborted']),
    note: z.string().max(500),
  }),
} as const;

export type ToolName = keyof typeof ToolSchemas;
export const TOOL_NAMES = Object.keys(ToolSchemas) as ToolName[];
export type ToolInput<N extends ToolName> = z.infer<(typeof ToolSchemas)[N]>;

export const TOOL_DESCRIPTIONS: Record<ToolName, string> = {
  get_status:
    'Return the current system phase, the known tomatoes (id, state, position in cm), the scissors, basket and camera poses, the last event, and the reachable limits. Cheap; call it whenever you need numbers without images.',
  get_views:
    'Render the three agent cameras (top: X/Y axes, front: X/Z axes, side: Y/Z axes). Each image is an orthographic view: 1 cm is the same number of pixels everywhere, so the grid and scale bar apply to the tomato, the scissors and the basket alike. Overlays: cm grid with world axes, numbered tomato markers with XYZ in cm, the target stem as a cyan line, the scissors as a schematic (pivot, two blades, cut point cross, blade axis and blade normal) with its angles, the basket as a rectangle with its centre, and the predicted fall line. Also returns the same information as JSON. Pass `cameras` to render fewer views.',
  move_camera:
    'Slide a camera along its rails (dx, dy, dz in cm, relative), pivot it (yaw, tilt in degrees, relative, limited to ±25°) or change its zoom (multiplier, e.g. 1.5 = closer). Use it when a leaf hides the target or when you need a closer look. Returns the new pose and a refreshed view of that camera.',
  move_scissors:
    'Move the scissors cut point to (x, y, z) in cm, either relative to the current cut point or absolute in the world frame (X right, Y back, Z up, origin at the plant base). Refused with out_of_reach if beyond the arm reach, or with collision (and the blocking position) if the straight path crosses a tomato or the main stem. Leaves are pushed aside. Move in steps of about 5 cm when far and 1 cm when close, and check the views between steps.',
  rotate_scissors:
    'Rotate the scissors: yaw around world Z, pitch around the blade transverse axis, roll around the blade axis, in degrees, relative or absolute. The cut line must end up perpendicular to the target stem (check in the view where the stem lies in the image plane) and the cut point must sit on the stem (check in the two other views).',
  open_scissors:
    'Open the blades so the stem can enter between them. Call it before approaching the final centimetre.',
  cut:
    'Close the blades. Succeeds with stem_cut when the cut line is within 0.6 cm of the target stem and at more than 45° from it; the tomato then falls. Otherwise returns nothing_between_blades, leaf_cut, or misaligned with the measured distance in cm and angle in degrees so you can correct.',
  move_basket:
    'Move the basket centre to (x, y) in cm on its rail under the plant, relative or absolute. The basket is 20×20 cm. Place it so the predicted fall line of the target lands inside it before cutting.',
  report:
    'Close the episode with the outcome (harvested, missed or aborted) and a one-sentence note explaining what happened and what you would do differently. Always call it last.',
};
```

Ajouter dans `index.ts` : `export * from './tools';`

- [ ] **Step 4: Vérifier le succès et les gates**

Run: `npm run lint && npm run typecheck && npm test`
Expected: tout vert ; vitest rapporte 15 tests (shared 14 + server 1).

- [ ] **Step 5: Commit**

```bash
git add packages/shared/src
git commit -m "feat(shared): schémas zod et descriptions des neuf outils MCP"
```

---

### Task 7: Package `sim` — scène Three.js minimale avec vue spectateur

**Files:**
- Create: `packages/sim/package.json`, `packages/sim/tsconfig.json`, `packages/sim/vite.config.ts`, `packages/sim/vitest.config.ts`, `packages/sim/index.html`
- Create: `packages/sim/src/main.tsx`, `packages/sim/src/App.tsx`, `packages/sim/src/styles.css`
- Create: `packages/sim/src/three/frame.ts`, `packages/sim/src/three/frame.test.ts`, `packages/sim/src/three/createScene.ts`, `packages/sim/src/three/SpectatorView.tsx`

**Interfaces:**
- Consumes: `Vec3` de `@tomato/shared`.
- Produces: `worldToThree(v: Vec3): THREE.Vector3`, `threeToWorld(v: THREE.Vector3): Vec3`, `createScene(canvas): SceneHandle` avec `{ scene, renderer, camera, controls, dispose(), addObject(obj) }`.

- [ ] **Step 1: Fichiers de package**

`packages/sim/package.json` :

```json
{
  "name": "@tomato/sim",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "vite --port 5173",
    "build": "vite build",
    "preview": "vite preview --port 5173",
    "typecheck": "tsc --noEmit",
    "shot": "playwright test"
  },
  "dependencies": {
    "@tomato/shared": "*",
    "react": "^19.0.0",
    "react-dom": "^19.0.0",
    "three": "^0.170.0"
  },
  "devDependencies": {
    "@playwright/test": "^1.50.0",
    "@tailwindcss/vite": "^4.0.0",
    "@types/react": "^19.0.0",
    "@types/react-dom": "^19.0.0",
    "@types/three": "^0.170.0",
    "@vitejs/plugin-react": "^4.3.0",
    "tailwindcss": "^4.0.0",
    "vite": "^6.0.0"
  }
}
```

`packages/sim/tsconfig.json` :

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": { "noEmit": true, "jsx": "react-jsx", "lib": ["ES2022", "DOM", "DOM.Iterable"], "types": ["vite/client"] },
  "include": ["src", "tests", "vite.config.ts", "playwright.config.ts"]
}
```

`packages/sim/vite.config.ts` :

```ts
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: { port: 5173, strictPort: true },
});
```

`packages/sim/vitest.config.ts` :

```ts
import { defineConfig } from 'vitest/config';
export default defineConfig({ test: { name: 'sim', environment: 'node', include: ['src/**/*.test.ts'] } });
```

`packages/sim/index.html` :

```html
<!doctype html>
<html lang="fr">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Tomato Collector</title>
  </head>
  <body class="bg-neutral-950 text-neutral-100">
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

`packages/sim/src/styles.css` :

```css
@import 'tailwindcss';
html, body, #root { height: 100%; margin: 0; }
```

`packages/sim/src/main.tsx` :

```tsx
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import './styles.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
```

- [ ] **Step 2: Test de `frame.ts` (échoue)**

`packages/sim/src/three/frame.test.ts` :

```ts
import { describe, expect, it } from 'vitest';
import { Vector3 } from 'three';
import { threeToWorld, worldToThree } from './frame';

describe('world <-> three frame', () => {
  it('maps world Z up to three Y up and world Y back to three -Z', () => {
    const v = worldToThree([10, 20, 30]);
    expect([v.x, v.y, v.z]).toEqual([10, 30, -20]);
  });

  it('round-trips', () => {
    expect(threeToWorld(worldToThree([1, -2, 3]))).toEqual([1, -2, 3]);
    expect(threeToWorld(new Vector3(5, 6, 7))).toEqual([5, -7, 6]);
  });
});
```

- [ ] **Step 3: Vérifier l'échec**

Run: `npm install` (à la racine, pour installer les dépendances de `sim`) puis `npx vitest run packages/sim/src/three/frame.test.ts`
Expected: FAIL, module `./frame` introuvable.

- [ ] **Step 4: Écrire `frame.ts`**

```ts
import { Vector3 } from 'three';
import type { Vec3 } from '@tomato/shared';

/** Monde (X droite, Y arrière, Z haut, cm) → Three.js (Y haut), 1 unité = 1 cm. */
export function worldToThree(v: Vec3): Vector3 {
  return new Vector3(v[0], v[2], -v[1]);
}

export function threeToWorld(v: Vector3): Vec3 {
  return [v.x, -v.z, v.y];
}
```

- [ ] **Step 5: Vérifier le succès**

Run: `npx vitest run packages/sim/src/three/frame.test.ts`
Expected: PASS, 2 tests.

- [ ] **Step 6: Écrire `createScene.ts`**

```ts
import {
  AmbientLight, Color, DirectionalLight, GridHelper, HemisphereLight, Mesh, MeshStandardMaterial,
  Object3D, PCFSoftShadowMap, PerspectiveCamera, PlaneGeometry, Scene, WebGLRenderer,
} from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { worldToThree } from './frame';

export interface SceneHandle {
  scene: Scene;
  renderer: WebGLRenderer;
  camera: PerspectiveCamera;
  controls: OrbitControls;
  addObject(obj: Object3D): void;
  dispose(): void;
}

export function createScene(canvas: HTMLCanvasElement): SceneHandle {
  const renderer = new WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = PCFSoftShadowMap;

  const scene = new Scene();
  scene.background = new Color('#0f1214');

  const camera = new PerspectiveCamera(40, 1, 1, 2000);
  camera.position.copy(worldToThree([160, -180, 110]));
  camera.lookAt(worldToThree([0, 0, 45]));

  const controls = new OrbitControls(camera, canvas);
  controls.target.copy(worldToThree([0, 0, 45]));
  controls.enableDamping = true;

  scene.add(new HemisphereLight('#dfe9f3', '#2a2a2a', 0.9));
  scene.add(new AmbientLight('#ffffff', 0.25));
  const sun = new DirectionalLight('#fff4e0', 2.2);
  sun.position.copy(worldToThree([120, -80, 220]));
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.left = -150;
  sun.shadow.camera.right = 150;
  sun.shadow.camera.top = 150;
  sun.shadow.camera.bottom = -150;
  sun.shadow.camera.far = 600;
  scene.add(sun);

  const floor = new Mesh(
    new PlaneGeometry(400, 400),
    new MeshStandardMaterial({ color: '#3a3f3b', roughness: 0.95 }),
  );
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  scene.add(floor);
  const grid = new GridHelper(400, 40, '#4a5250', '#2c3230');
  grid.position.y = 0.05;
  scene.add(grid);

  function resize(): void {
    const { clientWidth, clientHeight } = canvas;
    if (clientWidth === 0 || clientHeight === 0) return;
    renderer.setSize(clientWidth, clientHeight, false);
    camera.aspect = clientWidth / clientHeight;
    camera.updateProjectionMatrix();
  }
  const observer = new ResizeObserver(resize);
  observer.observe(canvas);
  resize();

  let running = true;
  function loop(): void {
    if (!running) return;
    controls.update();
    renderer.render(scene, camera);
    requestAnimationFrame(loop);
  }
  requestAnimationFrame(loop);

  return {
    scene,
    renderer,
    camera,
    controls,
    addObject: (obj) => scene.add(obj),
    dispose: () => {
      running = false;
      observer.disconnect();
      controls.dispose();
      renderer.dispose();
    },
  };
}
```

- [ ] **Step 7: Écrire `SpectatorView.tsx` et `App.tsx`**

`packages/sim/src/three/SpectatorView.tsx` :

```tsx
import { useEffect, useRef } from 'react';
import type { Object3D } from 'three';
import { createScene, type SceneHandle } from './createScene';

interface Props {
  /** Fabrique les objets à ajouter à la scène ; appelée une fois au montage. */
  build: () => Object3D[];
}

export function SpectatorView({ build }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const handleRef = useRef<SceneHandle | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const handle = createScene(canvas);
    for (const obj of build()) handle.addObject(obj);
    handleRef.current = handle;
    return () => handle.dispose();
  }, [build]);

  return <canvas ref={canvasRef} data-testid="spectator" className="h-full w-full block" />;
}
```

`packages/sim/src/App.tsx` (version Étape 1, sans plant ; la Task 8 y ajoute le plant) :

```tsx
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
```

- [ ] **Step 8: Vérifier à la main et par les gates**

Run: `npm run dev:sim` puis ouvrir `http://localhost:5173`.
Expected: fond sombre, sol gris avec grille, orbite à la souris fonctionnelle, pas d'erreur console.

Run: `npm run lint && npm run typecheck && npm test && npm run build`
Expected: tout vert.

- [ ] **Step 9: Commit**

```bash
git add packages/sim package-lock.json
git commit -m "feat(sim): page Vite/React, scène Three.js avec sol, lumières et vue spectateur"
```

---

### Task 8: Plant procédural v1

**Files:**
- Create: `packages/sim/src/plant/random.ts`, `packages/sim/src/plant/random.test.ts`
- Create: `packages/sim/src/plant/generatePlant.ts`, `packages/sim/src/plant/generatePlant.test.ts`
- Create: `packages/sim/src/plant/leafTexture.ts`, `packages/sim/src/plant/buildPlantMesh.ts`
- Modify: `packages/sim/src/App.tsx`

**Interfaces:**
- Consumes: `Vec3`, `vadd`, `vnorm`, `vscale`, `degToRad` de `@tomato/shared` ; `worldToThree`.
- Produces: `createRng(seed): () => number`, `PlantSpec`, `BranchSpec`, `LeafSpec`, `TomatoSpec`, `generatePlant(seed, options?)`, `buildPlantMesh(spec): THREE.Group` (les enfants tomates portent `userData.tomatoId`).

- [ ] **Step 1: Test du PRNG (échoue)**

`packages/sim/src/plant/random.test.ts` :

```ts
import { describe, expect, it } from 'vitest';
import { createRng } from './random';

describe('createRng', () => {
  it('is deterministic for a seed and in [0, 1)', () => {
    const a = createRng(7);
    const b = createRng(7);
    const xs = Array.from({ length: 5 }, () => a());
    expect(xs).toEqual(Array.from({ length: 5 }, () => b()));
    for (const x of xs) {
      expect(x).toBeGreaterThanOrEqual(0);
      expect(x).toBeLessThan(1);
    }
  });

  it('differs between seeds', () => {
    expect(createRng(1)()).not.toBe(createRng(2)());
  });
});
```

- [ ] **Step 2: Vérifier l'échec**

Run: `npx vitest run packages/sim/src/plant/random.test.ts`
Expected: FAIL, module `./random` introuvable.

- [ ] **Step 3: Écrire `random.ts`**

```ts
/** mulberry32 : PRNG 32 bits déterministe, suffisant pour la génération de plant. */
export function createRng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const between = (rng: () => number, min: number, max: number): number => min + (max - min) * rng();
export const intBetween = (rng: () => number, min: number, max: number): number => Math.floor(between(rng, min, max + 1));
```

- [ ] **Step 4: Vérifier le succès**

Run: `npx vitest run packages/sim/src/plant/random.test.ts`
Expected: PASS, 2 tests.

- [ ] **Step 5: Test de `generatePlant` (échoue)**

`packages/sim/src/plant/generatePlant.test.ts` :

```ts
import { describe, expect, it } from 'vitest';
import { vlen, vsub } from '@tomato/shared';
import { generatePlant } from './generatePlant';

describe('generatePlant', () => {
  const spec = generatePlant(123);

  it('is deterministic for a seed', () => {
    expect(generatePlant(123)).toEqual(spec);
    expect(generatePlant(124)).not.toEqual(spec);
  });

  it('builds a main stem from the ground to 60-80 cm with 3-5 branches', () => {
    expect(spec.mainStem[0]).toEqual([0, 0, 0]);
    const top = spec.mainStem[spec.mainStem.length - 1]!;
    expect(top[2]).toBeGreaterThanOrEqual(60);
    expect(top[2]).toBeLessThanOrEqual(80);
    expect(spec.branches.length).toBeGreaterThanOrEqual(3);
    expect(spec.branches.length).toBeLessThanOrEqual(5);
  });

  it('hangs 4-8 tomatoes on short pedicels tilted 0-60° from vertical', () => {
    expect(spec.tomatoes.length).toBeGreaterThanOrEqual(4);
    expect(spec.tomatoes.length).toBeLessThanOrEqual(8);
    for (const t of spec.tomatoes) {
      const d = vsub(t.centerCm, t.anchorCm);
      const len = vlen(d);
      expect(len).toBeGreaterThanOrEqual(4);
      expect(len).toBeLessThanOrEqual(6);
      const tiltDeg = (Math.acos(-d[2] / len) * 180) / Math.PI;
      expect(tiltDeg).toBeGreaterThanOrEqual(0);
      expect(tiltDeg).toBeLessThanOrEqual(60.001);
      expect(t.radiusCm).toBeGreaterThanOrEqual(2.5);
      expect(t.radiusCm).toBeLessThanOrEqual(3.5);
      expect(t.ripenAtS).toBeGreaterThan(0);
    }
    const ids = spec.tomatoes.map((t) => t.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('places leaves along the branches', () => {
    expect(spec.leaves.length).toBeGreaterThanOrEqual(spec.branches.length * 2);
    for (const leaf of spec.leaves) {
      expect(leaf.sizeCm).toBeGreaterThanOrEqual(8);
      expect(leaf.sizeCm).toBeLessThanOrEqual(14);
    }
  });
});
```

- [ ] **Step 6: Vérifier l'échec**

Run: `npx vitest run packages/sim/src/plant/generatePlant.test.ts`
Expected: FAIL, module `./generatePlant` introuvable.

- [ ] **Step 7: Écrire `generatePlant.ts`**

```ts
import { degToRad, vadd, vnorm, vscale, type Vec3 } from '@tomato/shared';
import { between, createRng, intBetween } from './random';

export interface BranchSpec {
  /** Point d'attache sur la tige principale. */
  fromCm: Vec3;
  /** Extrémité de la branche. */
  toCm: Vec3;
}

export interface LeafSpec {
  positionCm: Vec3;
  /** Normale du plan de la feuille (unitaire). */
  normal: Vec3;
  sizeCm: number;
  /** Rotation de la feuille autour de sa normale. */
  spinDeg: number;
}

export interface TomatoSpec {
  id: number;
  /** Attache du pédoncule sur la branche. */
  anchorCm: Vec3;
  /** Centre du fruit. */
  centerCm: Vec3;
  radiusCm: number;
  /** Instant sim (s) où le fruit devient mûr. */
  ripenAtS: number;
}

export interface PlantSpec {
  seed: number;
  /** Polyligne de la tige principale, du sol vers le haut. */
  mainStem: Vec3[];
  stemRadiusCm: number;
  branches: BranchSpec[];
  leaves: LeafSpec[];
  tomatoes: TomatoSpec[];
}

export interface PlantOptions {
  /** Écart entre deux maturités successives, en secondes sim. */
  ripenIntervalS?: number;
}

export function generatePlant(seed: number, options: PlantOptions = {}): PlantSpec {
  const rng = createRng(seed);
  const ripenIntervalS = options.ripenIntervalS ?? 20;

  const height = between(rng, 60, 80);
  const segments = 8;
  const mainStem: Vec3[] = [[0, 0, 0]];
  let x = 0;
  let y = 0;
  for (let i = 1; i <= segments; i++) {
    x += between(rng, -1.5, 1.5);
    y += between(rng, -1.5, 1.5);
    mainStem.push([x, y, (height * i) / segments]);
  }

  const branchCount = intBetween(rng, 3, 5);
  const branches: BranchSpec[] = [];
  for (let i = 0; i < branchCount; i++) {
    const z = between(rng, 20, height - 8);
    const idx = Math.min(segments, Math.max(1, Math.round((z / height) * segments)));
    const base = mainStem[idx]!;
    const from: Vec3 = [base[0], base[1], z];
    const azimuth = degToRad(between(rng, 0, 360));
    const length = between(rng, 18, 30);
    const droop = between(rng, -4, 6);
    const to: Vec3 = [from[0] + Math.cos(azimuth) * length, from[1] + Math.sin(azimuth) * length, from[2] + droop];
    branches.push({ fromCm: from, toCm: to });
  }

  const leaves: LeafSpec[] = [];
  for (const b of branches) {
    const n = intBetween(rng, 2, 4);
    for (let i = 0; i < n; i++) {
      const t = between(rng, 0.35, 1);
      const pos = vadd(b.fromCm, vscale(vnorm([b.toCm[0] - b.fromCm[0], b.toCm[1] - b.fromCm[1], b.toCm[2] - b.fromCm[2]]), t * Math.hypot(b.toCm[0] - b.fromCm[0], b.toCm[1] - b.fromCm[1], b.toCm[2] - b.fromCm[2])));
      const tilt = degToRad(between(rng, 10, 45));
      const az = degToRad(between(rng, 0, 360));
      leaves.push({
        positionCm: pos,
        normal: vnorm([Math.sin(tilt) * Math.cos(az), Math.sin(tilt) * Math.sin(az), Math.cos(tilt)]),
        sizeCm: between(rng, 8, 14),
        spinDeg: between(rng, 0, 360),
      });
    }
  }

  const tomatoCount = intBetween(rng, 4, 8);
  const tomatoes: TomatoSpec[] = [];
  const order = Array.from({ length: tomatoCount }, (_, i) => i).sort(() => rng() - 0.5);
  for (let i = 0; i < tomatoCount; i++) {
    const b = branches[i % branches.length]!;
    const t = between(rng, 0.3, 0.95);
    const anchor: Vec3 = [
      b.fromCm[0] + (b.toCm[0] - b.fromCm[0]) * t,
      b.fromCm[1] + (b.toCm[1] - b.fromCm[1]) * t,
      b.fromCm[2] + (b.toCm[2] - b.fromCm[2]) * t,
    ];
    const pedicel = between(rng, 4, 6);
    const tilt = degToRad(between(rng, 0, 60));
    const az = degToRad(between(rng, 0, 360));
    const dir: Vec3 = [Math.sin(tilt) * Math.cos(az), Math.sin(tilt) * Math.sin(az), -Math.cos(tilt)];
    tomatoes.push({
      id: i + 1,
      anchorCm: anchor,
      centerCm: vadd(anchor, vscale(dir, pedicel)),
      radiusCm: between(rng, 2.5, 3.5),
      ripenAtS: (order[i]! + 1) * ripenIntervalS,
    });
  }

  return { seed, mainStem, stemRadiusCm: 1.1, branches, leaves, tomatoes };
}
```

- [ ] **Step 8: Vérifier le succès**

Run: `npx vitest run packages/sim/src/plant/generatePlant.test.ts`
Expected: PASS, 4 tests.

- [ ] **Step 9: Écrire `leafTexture.ts` et `buildPlantMesh.ts`**

`packages/sim/src/plant/leafTexture.ts` :

```ts
import { CanvasTexture, SRGBColorSpace } from 'three';

let cached: CanvasTexture | null = null;

/** Feuille dessinée sur un canvas : forme lobée verte avec nervure, fond transparent. */
export function getLeafTexture(): CanvasTexture {
  if (cached) return cached;
  const size = 256;
  const c = document.createElement('canvas');
  c.width = size;
  c.height = size;
  const ctx = c.getContext('2d')!;
  ctx.clearRect(0, 0, size, size);
  ctx.fillStyle = '#3f8f3a';
  ctx.beginPath();
  ctx.moveTo(size / 2, 8);
  ctx.bezierCurveTo(size * 0.95, size * 0.2, size * 0.9, size * 0.75, size / 2, size - 8);
  ctx.bezierCurveTo(size * 0.1, size * 0.75, size * 0.05, size * 0.2, size / 2, 8);
  ctx.fill();
  ctx.strokeStyle = '#2b6b28';
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.moveTo(size / 2, 12);
  ctx.lineTo(size / 2, size - 12);
  ctx.stroke();
  cached = new CanvasTexture(c);
  cached.colorSpace = SRGBColorSpace;
  return cached;
}
```

`packages/sim/src/plant/buildPlantMesh.ts` :

```ts
import {
  CatmullRomCurve3, Color, CylinderGeometry, DoubleSide, Group, Mesh, MeshStandardMaterial,
  PlaneGeometry, SphereGeometry, TubeGeometry, Vector3,
} from 'three';
import type { Vec3 } from '@tomato/shared';
import { worldToThree } from '../three/frame';
import { getLeafTexture } from './leafTexture';
import type { PlantSpec } from './generatePlant';

const stemMaterial = new MeshStandardMaterial({ color: '#4c7d3a', roughness: 0.8 });
const tomatoMaterial = () => new MeshStandardMaterial({ color: '#3f9a3a', roughness: 0.35, metalness: 0.05 });

function segmentMesh(from: Vec3, to: Vec3, radius: number): Mesh {
  const a = worldToThree(from);
  const b = worldToThree(to);
  const dir = new Vector3().subVectors(b, a);
  const len = dir.length();
  const geo = new CylinderGeometry(radius * 0.8, radius, len, 10);
  const mesh = new Mesh(geo, stemMaterial);
  mesh.position.copy(a).addScaledVector(dir, 0.5);
  mesh.quaternion.setFromUnitVectors(new Vector3(0, 1, 0), dir.normalize());
  mesh.castShadow = true;
  return mesh;
}

export function buildPlantMesh(spec: PlantSpec): Group {
  const group = new Group();
  group.name = 'plant';

  const curve = new CatmullRomCurve3(spec.mainStem.map(worldToThree));
  const stem = new Mesh(new TubeGeometry(curve, 48, spec.stemRadiusCm, 10, false), stemMaterial);
  stem.castShadow = true;
  group.add(stem);

  for (const b of spec.branches) group.add(segmentMesh(b.fromCm, b.toCm, spec.stemRadiusCm * 0.6));

  const leafTex = getLeafTexture();
  const leafMat = new MeshStandardMaterial({ map: leafTex, alphaTest: 0.5, side: DoubleSide, roughness: 0.9 });
  for (const leaf of spec.leaves) {
    const mesh = new Mesh(new PlaneGeometry(leaf.sizeCm, leaf.sizeCm * 1.4), leafMat);
    mesh.position.copy(worldToThree(leaf.positionCm));
    mesh.quaternion.setFromUnitVectors(new Vector3(0, 0, 1), worldToThree(leaf.normal).normalize());
    mesh.rotateZ((leaf.spinDeg * Math.PI) / 180);
    mesh.castShadow = true;
    group.add(mesh);
  }

  for (const t of spec.tomatoes) {
    group.add(segmentMesh(t.anchorCm, t.centerCm, 0.35));
    const mesh = new Mesh(new SphereGeometry(t.radiusCm, 24, 18), tomatoMaterial());
    mesh.scale.set(1, 0.9, 1);
    mesh.position.copy(worldToThree(t.centerCm));
    mesh.castShadow = true;
    mesh.name = `tomato-${t.id}`;
    mesh.userData.tomatoId = t.id;
    group.add(mesh);
  }

  return group;
}

/** Couleur d'un fruit selon sa maturité 0..1 (vert → orange → rouge). Utilisée par M1. */
export function tomatoColor(ripeness: number): Color {
  const green = new Color('#3f9a3a');
  const orange = new Color('#e08a1e');
  const red = new Color('#c8261b');
  return ripeness < 0.5 ? green.clone().lerp(orange, ripeness * 2) : orange.clone().lerp(red, (ripeness - 0.5) * 2);
}
```

- [ ] **Step 10: Brancher le plant dans `App.tsx`**

Remplacer le `build` de `App.tsx` par :

```tsx
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
```

- [ ] **Step 11: Vérifier à la main et par les gates**

Run: `npm run dev:sim`, ouvrir `http://localhost:5173`.
Expected: un plant vert de 60 à 80 cm avec branches, feuilles et 4 à 8 tomates vertes suspendues, ombres au sol, orbite fonctionnelle.

Run: `npm run lint && npm run typecheck && npm test && npm run build`
Expected: tout vert ; 21 tests.

- [ ] **Step 12: Commit**

```bash
git add packages/sim/src
git commit -m "feat(sim): plant procédural v1 déterministe (tige, branches, feuilles, tomates)"
```

---

### Task 9: Capture Playwright de la scène

**Files:**
- Create: `packages/sim/playwright.config.ts`, `packages/sim/tests/scene.spec.ts`

**Interfaces:**
- Produces: la commande `npm run shot` qui écrit `data/shots/scene.png` (utilisée par le visual-checker à partir de l'Étape 2).

- [ ] **Step 1: Configuration**

`packages/sim/playwright.config.ts` :

```ts
import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests',
  timeout: 60_000,
  use: {
    baseURL: 'http://localhost:5173',
    viewport: { width: 1920, height: 1080 },
    launchOptions: { args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] },
  },
  webServer: {
    command: 'npm run dev',
    port: 5173,
    reuseExistingServer: true,
    timeout: 60_000,
  },
});
```

- [ ] **Step 2: Test de capture**

`packages/sim/tests/scene.spec.ts` :

```ts
import { expect, test } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';

const shotsDir = resolve(__dirname, '../../../data/shots');

test('spectator scene renders and is captured', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/');
  const canvas = page.getByTestId('spectator');
  await expect(canvas).toBeVisible();
  await page.waitForTimeout(1500);
  mkdirSync(shotsDir, { recursive: true });
  await page.screenshot({ path: resolve(shotsDir, 'scene.png') });
  expect(errors).toEqual([]);
});
```

- [ ] **Step 3: Installer le navigateur et lancer**

Run:
```bash
npx playwright install chromium
npm run shot
```
Expected: 1 test passé, fichier `data/shots/scene.png` créé, plant visible dessus.

- [ ] **Step 4: Commit**

```bash
git add packages/sim/playwright.config.ts packages/sim/tests
git commit -m "test(sim): capture Playwright de la scène spectateur"
```

---

### Task 10: README de développement et STATUS

**Files:**
- Create: `README.md`, `docs/STATUS.md`

- [ ] **Step 1: Écrire `README.md`**

```markdown
# Tomato Collector — démo « un agent LLM récolte des tomates »

Simulation 3D dans le navigateur d'un plant de tomates, d'un bras à ciseaux, d'un panier et de trois caméras.
Un agent Claude (headless, via un serveur MCP) reçoit des vues 2D annotées et commande le robot.
Un dashboard montre en direct la simulation, ce que l'agent voit, ses actions et les statuts.

Spec de design : `docs/superpowers/specs/2026-09-17-tomato-harvest-demo-design.md` (fait foi).

## Prérequis

- Node 22+, npm 10+
- Claude Code CLI connecté (l'agent utilise l'auth de la machine)
- `gh` connecté (issues et PR)
- Navigateur Chromium pour Playwright : `npx playwright install chromium`

## Installation

    npm install
    npx playwright install chromium

## Commandes

| Commande | Effet |
|---|---|
| `npm run dev:sim` | page sim + dashboard sur http://localhost:5173 |
| `npm run dev:server` | serveur MCP + WebSocket (Étape 3) |
| `npm run shot` | capture Playwright de la scène dans `data/shots/` |
| `npm run lint` / `npm run typecheck` / `npm test` / `npm run build` | les quatre gates, obligatoires avant toute PR |

## Structure

    packages/shared   contrats : types, schémas zod des outils MCP, machine à états, monde par défaut
    packages/sim      page navigateur : Three.js + Rapier, plant, bras, caméras, perception, annotations, dashboard React
    packages/server   Node : MCP streamable HTTP, hub WebSocket, journal des épisodes, runner d'agent
    docs/             spec, plans, STATUS.md
    .claude/          agents et skills du cycle de développement

## Conventions

- Unités : centimètres et degrés partout. Repère monde : X droite, Y arrière, Z haut, origine au pied du plant.
  Dans Three.js, 1 unité = 1 cm ; conversion unique dans `packages/sim/src/three/frame.ts`.
- TypeScript strict, pas de `any`, imports de types explicites.
- TDD : test qui échoue, puis implémentation minimale. Les fonctions de géométrie et de règles sont pures et testées sans navigateur.
- Un module par PR, rebase merge sur `main`, jamais de push direct sur `main` après l'Étape 1.
- Les erreurs renvoyées à l'agent sont des retours structurés (`ok: false, error, message, details`), jamais des exceptions.

## Cycle de développement

Le développement suit un cycle adapté de Marcel (`docs/superpowers/specs/...-design.md`, section 7) :

1. `/plan` crée une issue GitHub par module à partir du plan de l'étape (`docs/superpowers/plans/`).
2. `/cycle` prend l'issue suivante de l'étape courante (`docs/STATUS.md`), dispatche un builder dans un worktree,
   puis un judge, puis un visual-checker si la PR touche au rendu, puis merge et nettoie.
3. `/status` résume l'état ; `/checkpoint` sauvegarde la session avant un `/compact`.

Les étapes et leurs conditions de passage sont dans la spec, section 9. Les modules d'une même étape se construisent en parallèle.

## Piloter le robot à la main (à partir de l'Étape 3)

Le serveur MCP écoute sur `http://localhost:7331/mcp`. Pour l'ajouter à Claude Code interactif :

    claude mcp add --transport http tomato-robot http://localhost:7331/mcp

Puis, dans une session Claude Code, demander par exemple « regarde les trois vues et déplace le panier sous la tomate 2 ».
```

- [ ] **Step 2: Écrire `docs/STATUS.md`**

```markdown
# STATUS

**Étape courante :** S:1 — Fondations
**Repo :** arthurolivierfortin/Tomato-collector

## Étapes

| Étape | Modules | État |
|---|---|---|
| S:1 Fondations | monorepo, shared, scène minimale, plant v1, README, cycle, issues | en cours |
| S:2 Sim | M1 plant complet, M2 bras et outils, M3 caméras et annotations | à faire |
| S:3 Perception, serveur, agent, dashboard | M4, M5, M6, M7 | à faire |
| S:4 Intégration et tournage | — | à faire |

## Conditions de passage

- S:1 → S:2 : gates verts, capture `data/shots/scene.png` approuvée par le propriétaire, contrats de `shared` mergés.
- S:2 → S:3 : PR M1, M2, M3 mergées ; `get_views` local produit trois PNG conformes validés par le visual-checker.
- S:3 → S:4 : un épisode scripté de bout en bout (sans Claude) passe en intégration ; le dashboard affiche la trace et les vues.
- Fin : au moins un épisode `harvested` enregistré en vidéo avec la trace lisible, et un épisode de replay disponible.

## Journal

- 2026-09-17 : spec approuvée, plan de l'Étape 1 écrit.
```

- [ ] **Step 3: Commit**

```bash
git add README.md docs/STATUS.md
git commit -m "docs: README de développement et STATUS"
```

---

### Task 11: Cycle de développement dans `.claude/`

**Files:**
- Create: `.claude/settings.json`
- Create: `.claude/agents/builder.md`, `.claude/agents/judge.md`, `.claude/agents/visual-checker.md`, `.claude/agents/cleaner.md`
- Create: `.claude/skills/cycle/SKILL.md`, `.claude/skills/plan/SKILL.md`, `.claude/skills/status/SKILL.md`, `.claude/skills/checkpoint/SKILL.md`

- [ ] **Step 1: `settings.json`**

```json
{
  "permissions": {
    "allow": ["Read", "Write", "Edit", "Bash(*)", "Glob", "Grep", "WebFetch", "WebSearch", "Agent", "NotebookEdit"]
  }
}
```

- [ ] **Step 2: `agents/builder.md`**

```markdown
---
name: builder
description: Implémente UN module (une issue) en suivant son plan tâche par tâche en TDD, dans un worktree, coche la checklist, passe les gates, ouvre la PR. Ne merge jamais.
tools: Read, Grep, Glob, Bash, Write, Edit
model: opus
---

# Builder

Tu implémentes UN module de Tomato Collector. Tu suis le plan du module exactement, dans l'ordre, en TDD. Tu n'inventes pas de portée.

**Disciplines obligatoires :** `superpowers:test-driven-development` (aucun code de production sans test qui échoue d'abord), `superpowers:verification-before-completion` (aucune affirmation sans sortie de commande fraîche), `superpowers:systematic-debugging` (pas de correctif à l'aveugle).

**Contrats :** `packages/shared` est figé. Si le plan de ton module exige d'y changer quelque chose, ARRÊTE et rends `blocked` avec la raison : c'est l'orchestrateur qui décide.

## Entrées (fournies par l'orchestrateur)

- Numéro et titre de l'issue, chemin du plan `docs/superpowers/plans/<...>.md`, chemin de la checklist `docs/superpowers/specs/<...>-checklist.md`.

## Étape 1 — Worktree et branche

    git -C C:/Tomato-collector worktree add C:/Tomato-collector/.worktrees/<slug> -b feat/<NUMERO>-<slug> main
    cd C:/Tomato-collector/.worktrees/<slug> && npm install

Ne travaille JAMAIS directement dans `C:/Tomato-collector` ni sur `main`.

## Étape 2 — Pour chaque tâche du plan

1. RED : écris le test du plan tel quel. Lance-le : `npx vitest run <fichier>`. Il doit échouer pour la bonne raison.
2. GREEN : implémentation minimale. Relance : il doit passer.
3. Coche l'item `[SPEC-N]` / `[TEST-N]` de la checklist.
4. Commit : `feat(<module>): <ce que fait la tâche>`.

Si un test du plan est faux ou impossible, corrige-le et note la déviation dans le verdict (`plan_deviations`). Ne saute jamais une tâche en silence.

## Étape 3 — Gates

    npm run lint && npm run typecheck && npm test && npm run build

Pour un module qui touche au rendu : `npm run shot` aussi, et vérifie que `data/shots/*.png` existe.

Coche `[GATE-N]` seulement avec la sortie fraîche sous les yeux.

## Étape 4 — PR

    git push -u origin feat/<NUMERO>-<slug>
    gh pr create --base main --title "<type>(<module>): <titre>" --body "Closes #<NUMERO>\n\nChecklist: docs/superpowers/specs/<...>-checklist.md\nPlan: docs/superpowers/plans/<...>.md\n\n## Gates\n<sortie résumée>"

Passe l'issue en `in-review` : `gh issue edit <NUMERO> --remove-label todo --remove-label in-progress --add-label in-review`.

## Sortie

Écris `data/build_verdict.json` :

    { "status": "pr_created" | "failed" | "blocked", "pr": <numéro ou null>, "branch": "...", "items_skipped": [], "plan_deviations": [], "gates": { "lint": "pass|fail", "typecheck": "...", "test": "...", "build": "..." }, "reason": "" }

`items_skipped` non vide = PR invalide : ne l'ouvre pas, rends `failed`.
```

- [ ] **Step 3: `agents/judge.md`**

```markdown
---
name: judge
description: Revue indépendante en deux étapes — conformité à la checklist avec preuves fichier:ligne, puis qualité avec gates rejoués en sandbox. Verdict strict.
tools: Read, Grep, Glob, Bash
model: fable
---

# Judge

Tu es un relecteur INDÉPENDANT. Tu ne sais pas pourquoi le code a été écrit. Tu juges contre la **checklist** et les **gates**, pas contre l'intention.

**Règle de fer :** une PR est approuvée si et seulement si chaque `[SPEC-N]` a une preuve fichier:ligne, chaque `[TEST-N]` existe et exerce réellement le comportement, chaque gate passe en sandbox, et aucun fichier n'est hors du package prévu par le plan. Pas de zone grise.

## Lecture

    gh pr view <N> --json number,title,body,files
    gh pr diff <N>

Lis les fichiers sources complets, pas seulement le diff. La PR doit référencer une checklist ; sinon `rejected` avec « no linked checklist ».

## Étape 1 — Conformité (bloquante)

Pour chaque `[SPEC-N]` : localise l'implémentation (fichier:ligne), vérifie qu'elle fait ce que le texte dit, pas « à peu près ». Pour chaque `[TEST-N]` : localise le test, vérifie qu'il échouerait si l'implémentation était retirée (pas de `expect(true)`, pas de mock du code testé).

Vérifie que `packages/shared` n'a pas été modifié par un module (sauf si la checklist du module le prévoit explicitement). Vérifie que les unités sont des cm et des degrés et que les erreurs vers l'agent sont des retours structurés, jamais des `throw`.

Un item manquant → `request_changes`, et tu n'entres PAS en Étape 2.

## Étape 2 — Qualité (seulement si Étape 1 approuvée)

Sandbox obligatoire :

    git -C C:/Tomato-collector worktree add C:/Tomato-collector/.worktrees/judge-<N> && cd C:/Tomato-collector/.worktrees/judge-<N> && gh pr checkout <N> && npm install
    npm run lint ; npm run typecheck ; npm test ; npm run build

Capture les sorties. Tout code de retour non nul → `request_changes`. Ensuite : pas de `any`, pas de nombre magique non nommé pour une limite physique, fonctions pures là où le plan les demandait, fichiers < 200 lignes sauf justification, pas de dépendance native ajoutée (règle Windows). Déviations de plan non documentées = `important`.

## Verdict — `data/review_verdict_pr<N>.json`

    {
      "stage1_spec": { "status": "approved|request_changes", "items": [{ "id": "SPEC-1", "evidence": "file:line", "test": "file::name", "ok": true }], "blocking_items": [] },
      "stage2_quality": { "status": "approved|request_changes|skipped", "sandbox": { "lint": {"exit": 0, "tail": ""}, "typecheck": {...}, "test": {...}, "build": {...} }, "issues": [{ "severity": "blocking|important|minor", "file": "", "line": 0, "text": "" }], "plan_deviations": [] },
      "verdict": "approved|request_changes|rejected"
    }

Le bloc `sandbox` est obligatoire ; sans lui l'orchestrateur rejette ton verdict. Supprime ton worktree à la fin : `git -C C:/Tomato-collector worktree remove C:/Tomato-collector/.worktrees/judge-<N> --force`.
```

- [ ] **Step 4: `agents/visual-checker.md`**

```markdown
---
name: visual-checker
description: Pour les PR qui touchent au rendu 3D ou aux vues annotées — capture la scène et les vues avec Playwright et les compare aux critères visuels de la spec (sections 4.5 et 6). Verdict avec captures en preuve.
tools: Read, Grep, Glob, Bash
model: opus
---

# Visual Checker

Le visuel est le livrable de cette démo. Tu vérifies qu'une PR produit à l'écran ce que la spec décrit. Tu ne relis pas le code : le judge l'a fait.

## Entrées

Numéro de PR, liste des critères visuels attendus (fournie par l'orchestrateur à partir de la checklist du module).

## Procédure

    git -C C:/Tomato-collector worktree add C:/Tomato-collector/.worktrees/visual-<N> && cd C:/Tomato-collector/.worktrees/visual-<N> && gh pr checkout <N> && npm install
    npm run shot

Puis lis chaque image de `data/shots/` (outil Read sur le PNG). Pour chaque critère, réponds `pass` / `fail` avec ce que tu vois. Critères permanents de la spec :

- Scène : plant visible avec feuilles et tomates, ombres au sol, rien de noir ou de vide, pas d'objet hors champ.
- Vue annotée (à partir de M3) : fond assombri + contours blancs ; grille en cm avec étiquettes d'axes dans les marges et barre d'échelle ; marqueurs numérotés des tomates avec XYZ ; tige cible en cyan ; ciseaux en schéma (pivot, deux lames, croix du point de coupe, deux axes de couleurs différentes, angles en texte) ; panier en rectangle avec centre ; verticale de chute pointillée ; bandeau haut avec nom de la vue, axes, pose caméra, px/cm, temps sim.
- Lisibilité : texte des étiquettes lisible à 100 % sur un PNG de 800 px ; les couleurs des outils (magenta ciseaux, jaune panier, cyan tige) se distinguent des contours blancs.
- Dashboard (à partir de M7) : disposition 55/45, trois vues à droite, trace lisible, pastilles de phase.

## Verdict — `data/visual_verdict_pr<N>.json`

    { "verdict": "approved|request_changes|error", "shots": ["data/shots/scene.png"], "criteria": [{ "text": "", "result": "pass|fail", "observed": "" }], "error": "" }

Ne supprime pas les captures (le cleaner s'en charge après merge). Supprime ton worktree.
```

- [ ] **Step 5: `agents/cleaner.md`**

```markdown
---
name: cleaner
description: Hygiène post-cycle — supprime les artefacts de session selon des motifs explicites, prune les worktrees et branches mergées. Ne touche jamais un fichier suivi ni un chemin protégé ; tout ce qui est ambigu est rapporté, jamais supprimé.
tools: Read, Bash, Grep, Glob, Write
---

# Cleaner

**Règles de fer :** jamais `git clean`, jamais `rm -rf` sur un dossier, jamais de suppression d'un fichier suivi (`git ls-files`), jamais un chemin PROTÉGÉ. Chaque suppression est un chemin explicite. En cas de doute → `ambiguous`, intact.

## PROTÉGÉ

`.env*`, `docs/**`, `packages/**`, `.claude/**`, `node_modules/**`, `data/episodes/**` (journaux d'épisodes, matière du montage vidéo), `data/brainstorm*.md`.

## SUPPRIMABLE (non suivi seulement)

- `data/build_verdict.json`, `data/review_verdict_pr<N>.json`, `data/visual_verdict_pr<N>.json` dont la PR est MERGED ou CLOSED (`gh pr view <N> --json state`).
- `data/shots/*.png` dont la PR associée est mergée (les captures sont régénérées par `npm run shot`).
- `test-results/**`, `playwright-report/**` : fichier par fichier puis `rmdir` non récursif.
- `*.log` à la racine dont le processus n'existe plus.

## Git

    git -C C:/Tomato-collector worktree prune
    git -C C:/Tomato-collector worktree list
    git -C C:/Tomato-collector branch --merged main

Supprime les worktrees `.worktrees/*` dont la branche est mergée (`git worktree remove <chemin>`), puis la branche locale (`git branch -d`). Jamais `-D`.

## Rapport — `data/clean_report.json`

    { "deleted": [], "kept_protected": [], "ambiguous": [{ "path": "", "why": "" }], "worktrees_removed": [], "branches_deleted": [], "errors": [] }
```

- [ ] **Step 6: `skills/cycle/SKILL.md`**

```markdown
---
name: cycle
description: Boucle de dev principale — prend l'issue suivante de l'étape courante, dispatche builder → judge → visual-checker (si rendu) → merge rebase → cleaner. Deux retries max.
user-invocable: true
---

# Cycle

Tu es l'orchestrateur. Tu ne construis pas et ne relis pas toi-même : tu dispatches un sous-agent par phase. Une issue par invocation. Plusieurs invocations peuvent tourner en parallèle sur des issues différentes de la même étape (un worktree chacune).

## 0 — Se placer sur main à jour

    git -C C:/Tomato-collector checkout main && git -C C:/Tomato-collector pull origin main

## 1 — Choisir l'issue

Lis `docs/STATUS.md` pour l'étape courante `S:<N>`. Puis :

    gh issue list --repo arthurolivierfortin/Tomato-collector --label "ad-hoc" --label "P:high" --label "todo" --state open --limit 1 --json number,title
    gh issue list --repo arthurolivierfortin/Tomato-collector --label "S:<N>" --label "todo" --state open --limit 1 --json number,title

Priorité à l'ad-hoc P:high. Aucune issue `todo` : si toutes fermées → « Étape <N> terminée, vérifier la condition de passage dans STATUS.md et approuver », STOP ; sinon « issues en cours, attendre », STOP. L'issue doit lier un plan et une checklist, sinon STOP et demander au propriétaire.

Marque-la : `gh issue edit <NUM> --remove-label todo --add-label in-progress`.

## 2 — Builder

    Agent(subagent_type="builder", prompt="Implémente l'issue #<NUM>: <TITRE>. Plan: <chemin>. Checklist: <chemin>. Suis tes instructions d'agent. Écris data/build_verdict.json. Ne merge pas.")

Lis le verdict : `pr_created` sans `items_skipped` → 3 ; `blocked` → label `blocked`, commente la raison, STOP ; `failed` → commente, remets `todo`, STOP.

## 3 — Judge

    Agent(subagent_type="judge", prompt="Relis la PR #<PR> pour l'issue #<NUM>. Checklist: <chemin>. Plan: <chemin>. Étape 1 puis Étape 2, sandbox obligatoire. Écris data/review_verdict_pr<PR>.json.")

Valide le schéma ; `sandbox` absent → rejette le verdict et redispatche. `approved` → 4 ; `request_changes` → 6 ; `rejected` → ferme la PR, remets l'issue `todo` avec le motif.

## 4 — Visual-checker (si la PR touche `packages/sim/src/**` hors `*.test.ts`)

    gh pr diff <PR> --name-only

    Agent(subagent_type="visual-checker", prompt="Vérifie visuellement la PR #<PR>. Critères: <liste tirée de la checklist du module>. Écris data/visual_verdict_pr<PR>.json.")

`approved` → 5 ; `request_changes` → 6 (partage le compteur de retries) ; `error` → journalise et passe à 5 en le signalant au propriétaire.

## 5 — Merge

    gh pr merge <PR> --rebase --delete-branch
    gh issue close <NUM>

Mets à jour `docs/STATUS.md` (module fait, journal daté). Puis :

    Agent(subagent_type="cleaner", prompt="Nettoie après la PR #<PR> mergée / issue #<NUM>. Écris data/clean_report.json.")

Relis `ambiguous` toi-même.

## 6 — Corrections (2 retries max)

    Agent(subagent_type="builder", prompt="Corrige la PR #<PR> selon data/review_verdict_pr<PR>.json (et data/visual_verdict_pr<PR>.json si présent). Corrige chaque item bloquant et important. Relance les gates. Pousse sur la même branche. Écris data/build_verdict.json. Ne merge pas.")

Retour en 3. Après deux retries encore en `request_changes` : ferme la PR, remets l'issue `todo` avec le dernier verdict en commentaire, STOP.

## Règles

- Jamais de travail toi-même : un `Agent()` par phase.
- `packages/shared` est figé après l'Étape 1 : une PR qui le modifie sans que la checklist du module le prévoie est refusée.
- Tout passe par PR ; rebase merge, jamais squash.
- Les transitions d'étape sont approuvées par le propriétaire, pas par toi.
```

- [ ] **Step 7: `skills/plan/SKILL.md`**

```markdown
---
name: plan
description: Crée les issues GitHub d'une étape à partir de son plan (un module = une issue), avec labels S:<N>, todo, module.
user-invocable: true
---

# Plan

## 1 — Lire

    cat docs/STATUS.md
    ls docs/superpowers/plans/

Identifie l'étape (argument ou étape courante de STATUS.md) et les plans de modules `docs/superpowers/plans/2026-09-17-etape-<N>-m<K>-*.md`.

## 2 — Vérifier l'existant

    gh issue list --repo arthurolivierfortin/Tomato-collector --label "S:<N>" --state all --json number,title

Si des issues existent déjà pour un module, ne les recrée pas.

## 3 — Créer une issue par module

    gh issue create --repo arthurolivierfortin/Tomato-collector \
      --title "M<K> — <titre du module>" \
      --label "S:<N>,module,todo" \
      --body "## Objectif
<une phrase tirée du plan>

## Plan
docs/superpowers/plans/<fichier>.md

## Checklist
docs/superpowers/specs/<fichier>-checklist.md

## Étape
S:<N>

## Condition de passage de l'étape
<copiée de STATUS.md>"

## 4 — Confirmer

Liste les issues créées et rappelle : « Lance /cycle (une fois par module, en parallèle si tu veux) ».
```

- [ ] **Step 8: `skills/status/SKILL.md`**

```markdown
---
name: status
description: Résume l'état du projet — étape courante, issues par état, PR récentes, condition de passage.
user-invocable: true
---

# Status

    cat docs/STATUS.md
    gh issue list --repo arthurolivierfortin/Tomato-collector --state open --json number,title,labels
    gh pr list --repo arthurolivierfortin/Tomato-collector --state all --limit 8 --json number,title,state,mergedAt
    git -C C:/Tomato-collector worktree list
    git -C C:/Tomato-collector log --oneline -8

Affiche :

    ## Tomato Collector — Status
    Étape S:<N> : <titre> — <faits>/<total> modules mergés
    Issues : todo <n>, in-progress <n>, in-review <n>, blocked <n>
    PR : <liste>
    Worktrees actifs : <liste>
    Condition de passage : <texte> — <remplie / manque : ...>
```

- [ ] **Step 9: `skills/checkpoint/SKILL.md`**

```markdown
---
name: checkpoint
description: Sauvegarde l'état complet de la session avant un /compact ou /clear.
user-invocable: true
---

# Checkpoint

Écris (écrase) `C:\Users\arthu\.claude\projects\C--Tomato-collector\memory\session-checkpoint.md` avec frontmatter `name: session-checkpoint`, `type: project`, description « CHECKPOINT de session (date) — état complet pour reprise », et ces sections vérifiées par commandes (`gh pr list`, `git worktree list`, `git status`), pas de mémoire approximative :

1. Mandat en cours et niveau d'autonomie accordé.
2. Étape courante et condition de passage.
3. Mergé récemment (PR + une ligne).
4. En vol : chaque PR ouverte, ce qui reste, ID de chaque agent actif et son worktree.
5. Décisions en attente du propriétaire, numérotées.
6. Pièges appris cette session non déjà en mémoire.

Vérifie que `MEMORY.md` contient en tête la ligne « ⚡ CHECKPOINT session … LIRE EN PREMIER » vers ce fichier.

Termine par :

> Checkpoint écrit. Lance `/compact Préserve les PR ouvertes et leurs correctifs restants, les IDs des agents en vol, les worktrees actifs, les décisions en attente et les prochaines étapes. session-checkpoint.md fait foi.`
```

- [ ] **Step 10: Commit**

```bash
git add .claude
git commit -m "chore: cycle de développement adapté (builder, judge, visual-checker, cleaner, skills)"
```

---

### Task 12: Checklist de l'Étape 1, labels et issues GitHub

**Files:**
- Create: `docs/superpowers/specs/2026-09-17-etape-1-checklist.md`

- [ ] **Step 1: Écrire la checklist de l'Étape 1 (cochée au fur et à mesure des tâches précédentes)**

```markdown
# Étape 1 — Fondations — Checklist

## Code
- [ ] [SPEC-1] Monorepo npm workspaces, scripts lint/typecheck/test/build — `package.json`
- [ ] [SPEC-2] Machine à états des phases — `packages/shared/src/phases.ts`
- [ ] [SPEC-3] État du monde, poses, limites, monde par défaut — `packages/shared/src/world.ts`
- [ ] [SPEC-4] Actions et résultats structurés — `packages/shared/src/actions.ts`
- [ ] [SPEC-5] Contrat des vues et messages WebSocket — `packages/shared/src/views.ts`, `messages.ts`
- [ ] [SPEC-6] Schémas zod et descriptions des 9 outils MCP — `packages/shared/src/tools.ts`
- [ ] [SPEC-7] Conversion de repère monde ↔ Three — `packages/sim/src/three/frame.ts`
- [ ] [SPEC-8] Scène minimale avec vue spectateur — `packages/sim/src/three/createScene.ts`
- [ ] [SPEC-9] Plant procédural v1 déterministe — `packages/sim/src/plant/generatePlant.ts`, `buildPlantMesh.ts`
- [ ] [SPEC-10] README de dev et STATUS — `README.md`, `docs/STATUS.md`
- [ ] [SPEC-11] Cycle de dev — `.claude/agents/*.md`, `.claude/skills/*/SKILL.md`

## Tests
- [ ] [TEST-2] `packages/shared/src/phases.test.ts`
- [ ] [TEST-3] `packages/shared/src/world.test.ts`
- [ ] [TEST-4] `packages/shared/src/actions.test.ts`
- [ ] [TEST-5] `packages/shared/src/messages.test.ts`
- [ ] [TEST-6] `packages/shared/src/tools.test.ts`
- [ ] [TEST-7] `packages/sim/src/three/frame.test.ts`
- [ ] [TEST-9] `packages/sim/src/plant/random.test.ts`, `generatePlant.test.ts`
- [ ] [TEST-8] `packages/sim/tests/scene.spec.ts` (capture Playwright)

## Gates
- [ ] [GATE-1] npm run lint
- [ ] [GATE-2] npm run typecheck
- [ ] [GATE-3] npm test
- [ ] [GATE-4] npm run build
- [ ] [GATE-5] npm run shot → `data/shots/scene.png` approuvée par le propriétaire
```

- [ ] **Step 2: Créer les labels**

```bash
REPO=arthurolivierfortin/Tomato-collector
for l in "S:1:#6f42c1" "S:2:#0e8a16" "S:3:#1d76db" "S:4:#d93f0b" "todo:#ededed" "in-progress:#fbca04" "in-review:#0052cc" "blocked:#b60205" "module:#c5def5" "ad-hoc:#f9d0c4" "P:high:#e11d21"; do
  name="${l%:*}"; color="${l##*:}"
  gh label create "$name" --repo $REPO --color "${color#\#}" --force
done
```

Expected: 11 labels créés ou mis à jour.

- [ ] **Step 3: Créer les issues des modules M1 à M7 (les plans de modules seront liés quand ils existeront)**

```bash
REPO=arthurolivierfortin/Tomato-collector
create() { gh issue create --repo $REPO --title "$1" --label "$2,module,todo" --body "$3"; }
create "M1 — Plant complet : mûrissement, feuilles occultantes, physique Rapier, capteur panier" "S:2" "## Objectif
Le plant mûrit en temps accéléré, une tomate coupée tombe et le capteur du panier décide harvested ou missed.

## Plan
docs/superpowers/plans/2026-09-17-etape-2-m1-plant.md (à écrire après S:1)

## Étape
S:2 — condition de passage : PR M1, M2, M3 mergées ; get_views local produit trois PNG conformes validés par le visual-checker."
create "M2 — Bras 5 axes, ciseaux, règles de coupe, collision, panier sur rail" "S:2" "## Objectif
Le bras suit la pose commandée des ciseaux (IK analytique), cut applique la règle de coupe et renvoie des erreurs mesurées, le panier se déplace sur son rail.

## Plan
docs/superpowers/plans/2026-09-17-etape-2-m2-bras.md (à écrire après S:1)

## Étape
S:2"
create "M3 — Caméras orthographiques et couche d'annotation des vues" "S:2" "## Objectif
Trois caméras orthographiques sur rails, render targets 800×800, projection monde→pixels, grille et échelle automatiques, marqueurs, schémas ciseaux et panier, verticale de chute, JSON des vues.

## Plan
docs/superpowers/plans/2026-09-17-etape-2-m3-vues.md (à écrire après S:1)

## Étape
S:2"
create "M4 — Perception : Canny + CLAHE, YOLO ONNX avec fallback HSV, détecteur de réveil" "S:3" "## Plan
docs/superpowers/plans/2026-09-17-etape-3-m4-perception.md (à écrire après S:2)

## Étape
S:3 — condition de passage : un épisode scripté de bout en bout (sans Claude) passe en intégration ; le dashboard affiche la trace et les vues."
create "M5 — Serveur : MCP streamable HTTP, hub WebSocket, phases, journal, replay" "S:3" "## Plan
docs/superpowers/plans/2026-09-17-etape-3-m5-serveur.md (à écrire après S:2)

## Étape
S:3"
create "M6 — Runner d'agent : Agent SDK, prompt système, réveil, streaming, limite d'appels" "S:3" "## Plan
docs/superpowers/plans/2026-09-17-etape-3-m6-agent.md (à écrire après S:2)

## Étape
S:3"
create "M7 — Dashboard : panneaux, trace, statuts, schéma bloc animé, contrôles de tournage" "S:3" "## Plan
docs/superpowers/plans/2026-09-17-etape-3-m7-dashboard.md (à écrire après S:2)

## Étape
S:3"
```

Expected: 7 issues créées ; `gh issue list --repo arthurolivierfortin/Tomato-collector` les affiche avec leurs labels.

- [ ] **Step 4: Cocher la checklist, commit, push**

Coche tous les items de la checklist réellement faits (avec les sorties de gates sous les yeux), puis :

```bash
git add docs/superpowers/specs/2026-09-17-etape-1-checklist.md
git commit -m "docs: checklist de l'Étape 1 et issues GitHub des modules"
git push -u origin main
```

- [ ] **Step 5: Demander l'approbation de la capture**

Montrer `data/shots/scene.png` au propriétaire. La condition de passage de l'Étape 1 est remplie quand il approuve le visuel. Mettre à jour `docs/STATUS.md` (S:1 terminée, S:2 courante) et commiter.

---

## Auto-revue du plan

**Couverture de la spec (Étape 1 uniquement) :** monorepo et tooling (Task 1) ; contrats `shared` : phases (2), monde (3), actions (4), vues et messages (5), outils MCP (6) ; scène minimale et vue spectateur (7) ; plant v1 (8) ; capture (9) ; README et STATUS (10) ; cycle `.claude/` (11) ; checklist, labels, issues (12). Les modules M1 à M7 sont hors de ce plan par construction (plans séparés après la condition de passage).

**Cohérence des types :** `Vec3` readonly tuple partout ; `CameraId` défini dans `world.ts` et réutilisé par `views.ts`, `messages.ts`, `tools.ts` (via `CAMERA_IDS`) ; `ActionResult` utilisé par `messages.ts` ; `VIEW_SIZE_PX = 800` cohérent avec le test `pxPerCm = 800 / widthCm` ; `worldToThree` utilisé par `createScene.ts` et `buildPlantMesh.ts` ; `generatePlant` renvoie `centerCm`/`anchorCm` utilisés tels quels par `buildPlantMesh` et le test.

**Points d'attention à l'exécution :** versions npm exactes non figées (installer les dernières compatibles ; si `zod` v4 est tirée par défaut, forcer `zod@^3.25` pour rester sur l'API v3 attendue par le SDK MCP) ; Playwright headless avec SwiftShader peut mettre quelques secondes à rendre, d'où l'attente de 1,5 s avant capture.
