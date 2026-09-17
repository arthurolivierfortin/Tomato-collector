# Étape 3 — M7 Dashboard : panneaux, trace, statuts, schéma bloc animé, contrôles de tournage, replay : plan d'implémentation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Transformer la page sim en dashboard de tournage 1920×1080 (spec section 6) : à gauche la vue spectateur 3D, à droite les trois vues telles que l'agent les reçoit puis la trace de l'agent (plus récent en haut, erreurs surlignées), en haut un bandeau de statuts (phase, compteurs, temps sim et facteur, détecteur, modèle, coût), en bas un schéma bloc repliable dont le bloc et la flèche actifs s'allument à chaque message, des contrôles de tournage (pause, vitesse, mûrir, nouveau plant, masquer `h`, mode « ce que voit l'agent » `v`) et un replay d'épisode. Le tout alimenté par le pont de M5 (`Bridge.onServerMessage`) et, tant que M5 n'est pas mergé ou pour le replay, par un pont simulé `createFakeBridge`.

**Architecture:** Un module = un dossier `packages/sim/src/dashboard/` (issue GitHub #7). Tout ce qui est donnée ou logique est pur et testé sous Vitest Node : types (`dashboardTypes.ts`), mise en forme française de la trace (`traceFormat.ts`), réducteur en deux parties (`reduceServer.ts` pour les dix types de `ServerToDashboard`, `reduceLocal.ts` pour les messages `local_*`), store minimal compatible `useSyncExternalStore` (`dashboardStore.ts`), branchement d'un pont à la fois (`bridgeSlot.ts`), gardes de merge pour M5 et M4 (`bridgeLoader.ts`, `perceptionInfo.ts`), API des épisodes et scénario de replay (`episodesApi.ts`), scénario de démo (`demoScript.ts`), géométrie du schéma bloc (`blockLayout.ts`). Les composants React (`StatusBar`, `TracePanel` + `TraceRow`, `BlockDiagram`, `Controls`, `ReplayPanel`, `ViewsPanel`, `Dashboard`) ne portent aucune logique métier : ils lisent l'état du store et dispatchent. `StatusBar` et `TracePanel` ont un test de composant sous jsdom (pragma `// @vitest-environment jsdom`, `@testing-library/react`), le reste est couvert par Playwright (`tests/dashboard.spec.ts`, captures `data/shots/dashboard.png` et `dashboard-agentview.png`) et par le visual-checker. `App.tsx` est réécrit pour monter `Dashboard` en conservant le runtime, `MODULES`, `window.__tomato` et le pont de M5 (chargé par `import.meta.glob`, donc absent sans erreur tant que M5 n'est pas mergé).

**Tech Stack:** TypeScript 5.9 strict (`exactOptionalPropertyTypes`, `noUncheckedIndexedAccess`), ESLint `consistent-type-imports`, Vitest 3.2 (Node par défaut, jsdom 30 par pragma de fichier), React 19.3 (`useSyncExternalStore`, `useCallback`, `useEffect`, `useState`, `useMemo`), `@testing-library/react` 16.3 + `@testing-library/dom` 10.4, Tailwind 4 (`@theme` pour les tokens de palette, variantes `aria-pressed:`), Vite 7 (`import.meta.glob`, `import.meta.env.DEV`), Playwright 1.63. Aucune bibliothèque d'interface ajoutée.

**Spec:** `docs/superpowers/specs/2026-09-17-tomato-harvest-demo-design.md` (sections 1, 3, 6, 8, 9, 10) ; contrat inter-modules : `docs/superpowers/plans/2026-09-17-etape-3-architecture.md` (« Dashboard (M7) », « Pont côté sim (M5) », « Perception (M4) ») ; socle sim : `docs/superpowers/plans/2026-09-17-etape-2-architecture.md` ; composant `AgentViews` et `cameraModule` : `docs/superpowers/plans/2026-09-17-etape-2-m3-vues.md` (Tasks 8 et 9) ; checklist : `docs/superpowers/specs/2026-09-17-etape-3-m7-dashboard-checklist.md`.

## Global Constraints

- Un module = un dossier : tout le code M7 est dans `packages/sim/src/dashboard/`. Hors de ce dossier, M7 touche seulement `packages/sim/src/App.tsx`, `packages/sim/src/styles.css`, `packages/sim/package.json` (trois devDependencies), `packages/sim/vitest.config.ts` (motif `*.test.{ts,tsx}`), `packages/sim/tests/dashboard.spec.ts`, et crée `packages/sim/src/bridge/fakeBridge.ts` **uniquement s'il n'existe pas** (contrat M5, signature exacte du document d'architecture). `packages/shared` est figé : ne pas y toucher. `packages/sim/src/cameras/AgentViews.tsx` (M3) est réutilisé tel quel, jamais réécrit.
- Contrats consommés (Étape 3) : `Bridge { onServerMessage(fn): () => void; status(): 'connected' | 'disconnected'; onStatus(fn); close() }` et `createFakeBridge(script: { atMs: number; message: ServerToDashboard }[]) → Bridge` ; `perceptionState()` de M4 (`{ opencvReady; yoloReady; lastDetector; lastDetections }`), lu dynamiquement et facultatif à l'exécution ; `getRenderViews()`, `subscribeViews()` et `AgentViews` de M3 (`cameras/cameraModule.ts`, `cameras/AgentViews.tsx`) ; `SimRuntime.apply` pour les contrôles locaux (`set_paused`, `set_time_scale`, `ripen_next`, `new_plant`) ; `runtime.ctx.store.subscribe` pour l'horloge sim.
- État du dashboard (contrat) : `{ connection, phase, episode, counters, trace: TraceEntry[] (plus récent en tête, max 200), views: Record<CameraId, ViewImage | null>, lastViewsAt, blocks: { active, flow }, costUsd, model }`, `TraceEntry = { kind: 'text' | 'tool' | 'event' | 'phase'; atMs; title; detail?; ok?; durationMs? }` (plus `id` pour React et `callId` pour le rapprochement des appels). `reduce(state, message, nowMs = Date.now())` est pur : `nowMs` est injecté pour horodater la trace et les flashs, ce qui rend les tests déterministes.
- Esthétique (spec section 6, contrat) : sombre, sobre, technique ; la palette de la spec sert d'information (état d'une tomate, phase, erreur, bloc actif), jamais de décoration ; nombres en monospace `tabular-nums` ; aucun dégradé, aucune ombre décorative, aucune icône ornementale, pas de libellés en capitales ; mouvement seulement en réponse à un message (flash des vues 400 ms, bloc allumé 600 ms), `prefers-reduced-motion` respecté ; focus clavier visible ; chaque bouton a un nom accessible, les bascules portent `aria-pressed`, la phase courante `aria-current="step"`.
- Vérifications faites sur la doc officielle et npm (17 septembre 2026) : React 19 `useSyncExternalStore(subscribe, getSnapshot)` exige un `getSnapshot` qui renvoie la même valeur (`Object.is`) tant que le store n'a pas changé, d'où un store à snapshot immuable et une horloge sim exposée comme chaîne ; `useReducer` non retenu (le store doit être alimenté hors React par le pont) ; `@testing-library/react` 16.3.3 a pour peer `@testing-library/dom ^10` (à installer explicitement) et `react ^19` ; sans `globals`, `cleanup` s'appelle à la main dans `afterEach` ; Vitest 3.2 accepte le commentaire de contrôle `// @vitest-environment jsdom` en tête de fichier, avec le paquet `jsdom` (30.1.0) installé ; Tailwind 4 : `@theme { --color-x: #…; }` génère `bg-x`, `text-x`, `border-x`, `fill-x` et expose `var(--color-x)` en CSS ; Vite : `import.meta.glob(pattern | pattern[])` renvoie un objet vide quand aucun fichier ne correspond, résolu à la compilation, donc un module absent ne casse ni le build ni les tests.
- Fichiers < 200 lignes, pas de `any`, `Vec3` readonly, `exactOptionalPropertyTypes` (propriétés optionnelles omises plutôt que mises à `undefined`).
- Gates par PR : `npm run lint`, `npm run typecheck`, `npm test`, `npm run build`, `npm run shot` (module de rendu : `data/shots/dashboard.png` et `dashboard-agentview.png`, et `scene.png`, `view-*.png`, `robot.png` toujours produits).
- Le builder travaille dans un worktree sur la branche `feat/7-m7-dashboard` (voir `.claude/agents/builder.md`). M4, M5, M6 se construisent en parallèle : ce plan ne dépend d'aucun de leurs fichiers (gardes par `import.meta.glob`, pont simulé) et prévoit les règles de fusion si l'un d'eux est déjà mergé (Task 1 Step 3 et Task 9 Step 2).
- Tout le code de ce plan a été extrait dans une copie de `packages/sim` et vérifié : `tsc --noEmit` exit 0, `eslint` exit 0, `vitest run` 62 tests passés (49 de M7), `vite build` exit 0, `playwright test tests/dashboard.spec.ts` passé avec M1-M3 remplacés par des stubs (vues en repli sur `AgentViews`).

---

## Structure de fichiers

```
packages/sim/src/dashboard/
  dashboardTypes.ts        DashboardState, TraceEntry, LocalMessage, DashboardMessage                       (types)
  bridgeTypes.ts           DashboardBridge (vue structurelle du Bridge M5), ScriptEntry                       (types)
  initialState.ts          DEFAULT_MODEL, initialDashboardState()                                            (pur)
  traceFormat.ts           PHASE_LABEL, formatNum/Signed/Cm/Duration/Cost/Clock, firstLine, toolTitle, eventTitle, …   (pur)
  traceFormat.test.ts
  reduceServer.ts          reduceServer(state, ServerToDashboard, nowMs), TRACE_MAX = 200                    (pur)
  reduceLocal.ts           reduceLocal(state, LocalMessage)                                                  (pur)
  dashboardStore.ts        reduce(), createDashboardStore() → { get, dispatch, subscribe }                   (pur)
  dashboardStore.test.ts
  blockLayout.ts           BLOCKS, dimensions du SVG, blockX, blockCenterX, busSegment                       (pur)
  blockLayout.test.ts
  episodesApi.ts           listEpisodes, loadEpisode, isEpisodeFile, toScript, scriptDurationMs, fetchServerModel
  episodesApi.test.ts
  bridgeSlot.ts            createBridgeSlot(store) → { setLive, play, stop, mode }                           (pur)
  bridgeSlot.test.ts
  bridgeLoader.ts          WS_URL, loadLiveBridge(opts, candidates = import.meta.glob('../bridge/createBridge.ts'))
  bridgeLoader.test.ts
  perceptionInfo.ts        loadPerceptionState(candidates = glob perception), detectorLabel(info)
  perceptionInfo.test.ts
  demoScript.ts            buildDemoScript(views, state) → ScriptEntry[]                                     (pur)
  demoScript.test.ts
  ui.ts                    BTN, SELECT : classes Tailwind partagées
  useFlash.ts              useFlash(atMs, durationMs) → boolean
  useWorldClock.ts         useWorldClock(runtime) → SimClock | null (useSyncExternalStore sur le store monde)
  StatusBar.tsx            bandeau haut
  StatusBar.test.tsx       (jsdom)
  TraceRow.tsx             une ligne de trace
  TracePanel.tsx           liste plus récent en haut
  TracePanel.test.tsx      (jsdom)
  BlockDiagram.tsx         bandeau bas repliable, SVG inline
  Controls.tsx             contrôles de tournage
  ReplayPanel.tsx          liste des épisodes, vitesse, rejouer, arrêter
  ViewsPanel.tsx           vues reçues (clic pour agrandir) avec flash, repli sur AgentViews (M3)
  Dashboard.tsx            mise en page, raccourcis clavier
packages/sim/src/bridge/fakeBridge.ts      createFakeBridge (créé seulement s'il n'existe pas), fakeBridge.test.ts
packages/sim/src/App.tsx                   monte Dashboard ; runtime, MODULES, window.__tomato, pont M5 gardé
packages/sim/src/styles.css                tokens @theme de la palette, flash
packages/sim/package.json                  devDependencies @testing-library/react, @testing-library/dom, jsdom
packages/sim/vitest.config.ts              include src/**/*.test.{ts,tsx}
packages/sim/tests/dashboard.spec.ts       Playwright : épisode scripté injecté, captures dashboard.png et dashboard-agentview.png
docs/superpowers/specs/2026-09-17-etape-3-m7-dashboard-checklist.md
```

Ordre des tâches : 1 dépendances de test et pont simulé → 2 types et mise en forme de la trace → 3 réducteur et store → 4 pont (slot, gardes M5/M4, API des épisodes) → 5 scénario de démo et géométrie du schéma bloc → 6 palette et hooks → 7 bandeau et trace (composants testés) → 8 schéma bloc, contrôles, replay, vues → 9 mise en page et `App.tsx` → 10 test Playwright → 11 gates, captures, checklist, PR.

---

### Task 1: Dépendances de test, motif Vitest, pont simulé `createFakeBridge`

**Files:**
- Modify: `packages/sim/package.json`, `packages/sim/vitest.config.ts`
- Create (seulement si absent) : `packages/sim/src/bridge/fakeBridge.ts`, `packages/sim/src/bridge/fakeBridge.test.ts`

**Interfaces:**
- Produces (contrat Étape 3, « Pont côté sim ») :
  - `type BridgeStatus = 'connected' | 'disconnected'`
  - `interface Bridge { onServerMessage(fn: (m: ServerToDashboard) => void): () => void; status(): BridgeStatus; onStatus(fn: (s: BridgeStatus) => void): () => void; close(): void }`
  - `interface ScriptEntry { atMs: number; message: ServerToDashboard }`
  - `createFakeBridge(script: ScriptEntry[]): Bridge` : les minuteries partent à la création ; le consommateur s'abonne immédiatement après.

- [ ] **Step 1: Ajouter les dépendances et le motif de test**

Dans `packages/sim/package.json`, ajouter aux `devDependencies` (ordre alphabétique) :

```json
"@testing-library/dom": "^10.4.0",
"@testing-library/react": "^16.3.0",
"jsdom": "^30.0.0",
```

Puis remplacer `packages/sim/vitest.config.ts` par :

```ts
import { defineConfig } from 'vitest/config';
export default defineConfig({ test: { name: 'sim', environment: 'node', include: ['src/**/*.test.{ts,tsx}'] } });
```

Run: `npm install` (à la racine) puis `npx vitest run packages/sim`
Expected: install en 0 ; les tests existants du package `sim` passent toujours (l'environnement reste Node ; seuls les fichiers portant le pragma jsdom changeront d'environnement).

- [ ] **Step 2: Test du pont simulé (échoue)**

Si `packages/sim/src/bridge/fakeBridge.ts` existe déjà (M5 mergé avant M7), sauter les Steps 2 à 4 : ne pas le réécrire, et vérifier seulement que `createFakeBridge` y est exporté avec la signature du contrat (`grep -n "export function createFakeBridge" packages/sim/src/bridge/fakeBridge.ts`).

`packages/sim/src/bridge/fakeBridge.test.ts` :

```ts
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ServerToDashboard } from '@tomato/shared';
import { createFakeBridge } from './fakeBridge';

const phase = (p: 'detected' | 'harvesting'): ServerToDashboard => ({ type: 'phase', phase: p, reason: 'test' });

describe('createFakeBridge', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('delivers the scripted messages at their atMs, in order, and starts connected', () => {
    const bridge = createFakeBridge([
      { atMs: 100, message: phase('harvesting') },
      { atMs: 0, message: phase('detected') },
    ]);
    const seen: string[] = [];
    bridge.onServerMessage((m) => seen.push(m.type === 'phase' ? m.phase : m.type));
    expect(bridge.status()).toBe('connected');
    vi.advanceTimersByTime(0);
    expect(seen).toEqual(['detected']);
    vi.advanceTimersByTime(100);
    expect(seen).toEqual(['detected', 'harvesting']);
  });

  it('close cancels pending messages, flips the status once and notifies subscribers', () => {
    const bridge = createFakeBridge([{ atMs: 50, message: phase('detected') }]);
    const seen: ServerToDashboard[] = [];
    const statuses: string[] = [];
    bridge.onServerMessage((m) => seen.push(m));
    bridge.onStatus((s) => statuses.push(s));
    bridge.close();
    bridge.close();
    vi.advanceTimersByTime(100);
    expect(seen).toEqual([]);
    expect(statuses).toEqual(['disconnected']);
    expect(bridge.status()).toBe('disconnected');
  });

  it('unsubscribe stops delivery', () => {
    const bridge = createFakeBridge([{ atMs: 10, message: phase('detected') }]);
    const seen: ServerToDashboard[] = [];
    const off = bridge.onServerMessage((m) => seen.push(m));
    off();
    vi.advanceTimersByTime(20);
    expect(seen).toEqual([]);
  });
});
```

- [ ] **Step 3: Vérifier l'échec**

Run: `npx vitest run packages/sim/src/bridge/fakeBridge.test.ts`
Expected: FAIL, module `./fakeBridge` introuvable.

- [ ] **Step 4: Écrire `fakeBridge.ts`**

```ts
import type { ServerToDashboard } from '@tomato/shared';

export type BridgeStatus = 'connected' | 'disconnected';

/** Pont sim ↔ serveur vu du dashboard (contrat Étape 3, « Pont côté sim »). */
export interface Bridge {
  onServerMessage(fn: (m: ServerToDashboard) => void): () => void;
  status(): BridgeStatus;
  onStatus(fn: (s: BridgeStatus) => void): () => void;
  close(): void;
}

/** Une entrée de scénario : message diffusé `atMs` millisecondes après la création du pont. */
export interface ScriptEntry {
  atMs: number;
  message: ServerToDashboard;
}

/**
 * Pont simulé : rejoue un scénario horodaté. Les minuteries démarrent à la création,
 * le consommateur s'abonne donc immédiatement après (les entrées à 0 ms partent au tick suivant).
 */
export function createFakeBridge(script: ScriptEntry[]): Bridge {
  const listeners = new Set<(m: ServerToDashboard) => void>();
  const statusListeners = new Set<(s: BridgeStatus) => void>();
  let status: BridgeStatus = 'connected';
  const timers = script.map((entry) =>
    setTimeout(() => {
      for (const fn of listeners) fn(entry.message);
    }, Math.max(0, entry.atMs)),
  );
  return {
    onServerMessage(fn) {
      listeners.add(fn);
      return () => {
        listeners.delete(fn);
      };
    },
    status: () => status,
    onStatus(fn) {
      statusListeners.add(fn);
      return () => {
        statusListeners.delete(fn);
      };
    },
    close() {
      if (status === 'disconnected') return;
      for (const t of timers) clearTimeout(t);
      status = 'disconnected';
      for (const fn of statusListeners) fn(status);
    },
  };
}
```

- [ ] **Step 5: Vérifier le succès**

Run: `npx vitest run packages/sim/src/bridge/fakeBridge.test.ts`
Expected: PASS, 3 tests.

- [ ] **Step 6: Commit**

```bash
git add packages/sim/package.json package-lock.json packages/sim/vitest.config.ts packages/sim/src/bridge/fakeBridge.ts packages/sim/src/bridge/fakeBridge.test.ts
git commit -m "feat(dashboard): dépendances de test jsdom/testing-library, pont simulé createFakeBridge"
```

---

### Task 2: Types du dashboard et mise en forme française de la trace

**Files:**
- Create: `packages/sim/src/dashboard/dashboardTypes.ts`, `bridgeTypes.ts`, `initialState.ts`, `traceFormat.ts`, `traceFormat.test.ts`

**Interfaces:**
- Consumes: `BlockId`, `CameraId`, `Phase`, `ServerToDashboard`, `SimEvent`, `ViewImage` de `@tomato/shared`.
- Produces:
  - `type TraceKind = 'text' | 'tool' | 'event' | 'phase'`, `interface TraceEntry { id: number; kind: TraceKind; atMs: number; title: string; detail?: string; ok?: boolean; durationMs?: number; callId?: string }`
  - `type Connection = 'connected' | 'disconnected' | 'replay'`, `type Outcome = 'harvested' | 'missed' | 'aborted'`, `interface EpisodeInfo { id; tomatoId; startedAtMs }`, `type Counters = Record<Outcome, number>`, `interface BlockFlow { from: BlockId; to: BlockId; label: string }`, `interface SimClock { simTimeS; timeScale; paused }`, `interface UiState { controlsHidden; agentView; diagramOpen; enlarged: CameraId | null }`
  - `interface DashboardState { connection; phase; phaseAtMs; episode; counters; trace; nextTraceId; views: Record<CameraId, ViewImage | null>; lastViewsAt; blocks: { active: BlockId | null; flow: BlockFlow | null; atMs: number | null }; costUsd; model; sim: SimClock; ui: UiState }`
  - `type LocalMessage = { type: 'local_connection'; connection } | { type: 'local_reset' } | { type: 'local_model'; model } | { type: 'local_toggle_controls' } | { type: 'local_toggle_agent_view' } | { type: 'local_toggle_diagram' } | { type: 'local_enlarge'; camera: CameraId | null }`, `type DashboardMessage = ServerToDashboard | LocalMessage`
  - `interface DashboardBridge { onServerMessage(fn): () => void; status(): BridgeStatus; onStatus(fn): (() => void) | void; close(): void }`, `interface ScriptEntry { atMs; message }` (copie structurelle côté dashboard : le dashboard ne dépend pas des fichiers de M5)
  - `const DEFAULT_MODEL = 'claude-opus-5'`, `initialDashboardState(model?: string | null): DashboardState`
  - `PHASE_LABEL: Record<Phase, string>`, `OUTCOME_LABEL`, `formatNum(n, digits = 0)`, `formatSigned(n, digits = 0)`, `formatCm(n)`, `formatDuration(ms)`, `formatCost(usd)`, `formatClock(atMs)`, `firstLine(text, max)`, `toolTitle(tool: string, args: Record<string, unknown>): string`, `eventTitle(e: SimEvent)`, `phaseTitle(phase)`, `snapshotTitle(phase)`, `episodeStartTitle(m)`, `episodeEndTitle(m)`, `viewsTitle(cameras)`

- [ ] **Step 1: Écrire les types**

`packages/sim/src/dashboard/dashboardTypes.ts` :

```ts
import type { BlockId, CameraId, Phase, ServerToDashboard, ViewImage } from '@tomato/shared';

export type TraceKind = 'text' | 'tool' | 'event' | 'phase';

/** Une ligne de la trace ; `ok === false` = erreur surlignée. */
export interface TraceEntry {
  id: number;
  kind: TraceKind;
  atMs: number;
  title: string;
  detail?: string;
  ok?: boolean;
  durationMs?: number;
  /** Identifiant d'appel d'outil, pour rapprocher tool_call_start et tool_call_result. */
  callId?: string;
}

export type Connection = 'connected' | 'disconnected' | 'replay';
export type Outcome = 'harvested' | 'missed' | 'aborted';

export interface EpisodeInfo {
  id: string;
  tomatoId: number;
  startedAtMs: number;
}

export type Counters = Record<Outcome, number>;

export interface BlockFlow {
  from: BlockId;
  to: BlockId;
  label: string;
}

export interface SimClock {
  simTimeS: number;
  timeScale: number;
  paused: boolean;
}

export interface UiState {
  controlsHidden: boolean;
  agentView: boolean;
  diagramOpen: boolean;
  enlarged: CameraId | null;
}

export interface DashboardState {
  connection: Connection;
  phase: Phase;
  phaseAtMs: number | null;
  episode: EpisodeInfo | null;
  counters: Counters;
  /** Plus récent en tête, au plus TRACE_MAX entrées. */
  trace: TraceEntry[];
  nextTraceId: number;
  views: Record<CameraId, ViewImage | null>;
  lastViewsAt: number | null;
  blocks: { active: BlockId | null; flow: BlockFlow | null; atMs: number | null };
  costUsd: number;
  model: string | null;
  sim: SimClock;
  ui: UiState;
}

export type LocalMessage =
  | { type: 'local_connection'; connection: Connection }
  | { type: 'local_reset' }
  | { type: 'local_model'; model: string }
  | { type: 'local_toggle_controls' }
  | { type: 'local_toggle_agent_view' }
  | { type: 'local_toggle_diagram' }
  | { type: 'local_enlarge'; camera: CameraId | null };

export type DashboardMessage = ServerToDashboard | LocalMessage;
```

`packages/sim/src/dashboard/bridgeTypes.ts` :

```ts
import type { ServerToDashboard } from '@tomato/shared';

export type BridgeStatus = 'connected' | 'disconnected';

/**
 * Ce que le dashboard attend d'un pont (réel M5 `createBridge` ou simulé `createFakeBridge`).
 * Compatible structurellement avec `Bridge` du contrat Étape 3 ; `onStatus` tolère un retour void.
 */
export interface DashboardBridge {
  onServerMessage(fn: (m: ServerToDashboard) => void): () => void;
  status(): BridgeStatus;
  onStatus(fn: (s: BridgeStatus) => void): (() => void) | void;
  close(): void;
}

/** Une entrée de scénario rejouable (même forme que `messages[]` d'un fichier d'épisode). */
export interface ScriptEntry {
  atMs: number;
  message: ServerToDashboard;
}
```

`packages/sim/src/dashboard/initialState.ts` :

```ts
import type { DashboardState } from './dashboardTypes';

/** Modèle affiché tant que le serveur n'en a pas annoncé un autre (`TOMATO_MODEL` par défaut, contrat Étape 3). */
export const DEFAULT_MODEL = 'claude-opus-5';

export function initialDashboardState(model: string | null = DEFAULT_MODEL): DashboardState {
  return {
    connection: 'disconnected',
    phase: 'idle',
    phaseAtMs: null,
    episode: null,
    counters: { harvested: 0, missed: 0, aborted: 0 },
    trace: [],
    nextTraceId: 1,
    views: { top: null, front: null, side: null },
    lastViewsAt: null,
    blocks: { active: null, flow: null, atMs: null },
    costUsd: 0,
    model,
    sim: { simTimeS: 0, timeScale: 1, paused: false },
    ui: { controlsHidden: false, agentView: false, diagramOpen: true, enlarged: null },
  };
}
```

- [ ] **Step 2: Test de la mise en forme (échoue)**

`packages/sim/src/dashboard/traceFormat.test.ts` :

```ts
import { describe, expect, it } from 'vitest';
import {
  PHASE_LABEL, episodeEndTitle, episodeStartTitle, eventTitle, firstLine, formatClock, formatCost, formatDuration,
  formatNum, formatSigned, phaseTitle, snapshotTitle, toolTitle, viewsTitle,
} from './traceFormat';

describe('number formatting', () => {
  it('uses a decimal comma and a typographic minus, never −0', () => {
    expect(formatNum(12)).toBe('12');
    expect(formatNum(-1.5, 1)).toBe('−1,5');
    expect(formatNum(-0.04, 1)).toBe('0,0');
    expect(formatSigned(5)).toBe('+5');
    expect(formatSigned(-2)).toBe('−2');
    expect(formatSigned(0)).toBe('0');
  });

  it('formats durations in ms, s and min', () => {
    expect(formatDuration(420)).toBe('420 ms');
    expect(formatDuration(1800)).toBe('1,8 s');
    expect(formatDuration(65_000)).toBe('1 min 05 s');
  });

  it('formats the cumulated cost with four decimals', () => {
    expect(formatCost(0.0421)).toBe('0,0421 $');
    expect(formatCost(0)).toBe('0,0000 $');
  });

  it('formats a wall clock HH:MM:SS in local time', () => {
    expect(formatClock(new Date(2026, 8, 17, 14, 3, 7).getTime())).toBe('14:03:07');
    expect(formatClock(Date.now())).toMatch(/^\d{2}:\d{2}:\d{2}$/);
  });

  it('keeps the first line and truncates with an ellipsis', () => {
    expect(firstLine('  bonjour\nsuite ', 20)).toBe('bonjour');
    expect(firstLine('a'.repeat(30), 10)).toBe(`${'a'.repeat(9)}…`);
  });
});

describe('toolTitle', () => {
  it('describes the nine tools in French with their arguments', () => {
    expect(toolTitle('get_status', {})).toBe('État demandé');
    expect(toolTitle('get_views', {})).toBe('Vues demandées : top, front, side');
    expect(toolTitle('get_views', { cameras: ['top'] })).toBe('Vues demandées : top');
    expect(toolTitle('move_camera', { camera: 'front', dx: 5, zoom: 1.5 })).toBe('Caméra front : dX +5, zoom ×1,5');
    expect(toolTitle('move_camera', { camera: 'top', yaw: -10 })).toBe('Caméra top : lacet −10°');
    expect(toolTitle('move_scissors', { x: 12, y: 4, z: 38, mode: 'absolute' })).toBe('Ciseaux → X 12, Y 4, Z 38');
    expect(toolTitle('move_scissors', { x: 5, y: 0, z: -1.5, mode: 'relative' })).toBe('Ciseaux : ΔX +5, ΔY 0, ΔZ −1,5');
    expect(toolTitle('rotate_scissors', { yaw: 30, mode: 'absolute' })).toBe('Ciseaux orientés : lacet 30°');
    expect(toolTitle('rotate_scissors', { yaw: 20, pitch: -5, mode: 'relative' })).toBe('Ciseaux tournés : lacet +20°, tangage −5°');
    expect(toolTitle('open_scissors', {})).toBe('Ciseaux ouverts');
    expect(toolTitle('cut', {})).toBe('Coupe');
    expect(toolTitle('move_basket', { x: 3, y: -2, mode: 'absolute' })).toBe('Panier → X 3, Y −2');
    expect(toolTitle('report', { outcome: 'harvested', note: 'ok' })).toBe('Rapport : récoltée');
    expect(toolTitle('frobnicate', {})).toBe('Outil frobnicate');
  });
});

describe('event, phase and episode titles', () => {
  it('names sim events', () => {
    expect(eventTitle({ type: 'ripe_detected', tomatoId: 3, detector: 'hsv', confidence: 0.87 })).toBe('Tomate 3 mûre détectée (hsv, 0,87)');
    expect(eventTitle({ type: 'tomato_landed', tomatoId: 3, inBasket: true })).toBe('Tomate 3 dans le panier');
    expect(eventTitle({ type: 'tomato_landed', tomatoId: 3, inBasket: false })).toBe('Tomate 3 tombée au sol');
    expect(eventTitle({ type: 'plant_regenerated', seed: 42 })).toBe('Nouveau plant (graine 42)');
  });

  it('labels the eight phases and the episode messages', () => {
    expect(Object.keys(PHASE_LABEL)).toHaveLength(8);
    expect(phaseTitle('detected')).toBe('Phase détectée');
    expect(snapshotTitle('idle')).toBe('État reçu du serveur, phase repos');
    expect(episodeStartTitle({ type: 'episode_start', episodeId: 'e1', tomatoId: 2, sessionResumed: true })).toBe('Épisode e1 : tomate 2, session reprise');
    expect(
      episodeEndTitle({ type: 'episode_end', episodeId: 'e1', outcome: 'harvested', note: '', toolCalls: 7, costUsd: 0.0421, durationMs: 3900 }),
    ).toBe('Épisode terminé : récoltée, 7 appels, 3,9 s, 0,0421 $');
    expect(viewsTitle(['top', 'front'])).toBe('Vues rendues : top, front');
  });
});
```

- [ ] **Step 3: Vérifier l'échec**

Run: `npx vitest run packages/sim/src/dashboard/traceFormat.test.ts`
Expected: FAIL, module `./traceFormat` introuvable.

- [ ] **Step 4: Écrire `traceFormat.ts`**

```ts
import type { CameraId, Phase, ServerToDashboard, SimEvent } from '@tomato/shared';
import type { Outcome } from './dashboardTypes';

export const PHASE_LABEL: Record<Phase, string> = {
  idle: 'repos',
  detected: 'détectée',
  harvesting: 'récolte',
  cutting: 'coupe',
  falling: 'chute',
  harvested: 'récoltée',
  missed: 'ratée',
  aborted: 'abandon',
};

export const OUTCOME_LABEL: Record<Outcome, string> = { harvested: 'récoltée', missed: 'ratée', aborted: 'abandon' };

const MINUS = '−';
const ALL_CAMERAS: readonly CameraId[] = ['top', 'front', 'side'];

/** Nombre en notation française : virgule décimale, signe moins typographique, jamais « −0 ». */
export function formatNum(n: number, digits = 0): string {
  const fixed = Math.abs(n).toFixed(digits);
  const negative = n < 0 && Number(fixed) !== 0;
  return `${negative ? MINUS : ''}${fixed.replace('.', ',')}`;
}

export function formatSigned(n: number, digits = 0): string {
  return n > 0 ? `+${formatNum(n, digits)}` : formatNum(n, digits);
}

/** Centimètres ou degrés : entier tel quel, sinon une décimale. */
export function formatCm(n: number): string {
  return Number.isInteger(n) ? formatNum(n) : formatNum(n, 1);
}

export function formatDuration(ms: number): string {
  if (ms < 1000) return `${Math.round(ms)} ms`;
  if (ms < 60_000) return `${formatNum(ms / 1000, 1)} s`;
  const min = Math.floor(ms / 60_000);
  const s = Math.round((ms - min * 60_000) / 1000);
  return `${min} min ${String(s).padStart(2, '0')} s`;
}

export function formatCost(usd: number): string {
  return `${formatNum(usd, 4)} $`;
}

/** Heure locale HH:MM:SS d'un horodatage en ms. */
export function formatClock(atMs: number): string {
  const d = new Date(atMs);
  return [d.getHours(), d.getMinutes(), d.getSeconds()].map((v) => String(v).padStart(2, '0')).join(':');
}

export function firstLine(text: string, max: number): string {
  const line = text.trim().split('\n')[0] ?? '';
  return line.length > max ? `${line.slice(0, max - 1)}…` : line;
}

type Args = Record<string, unknown>;

const num = (args: Args, key: string): number | undefined => {
  const v = args[key];
  return typeof v === 'number' && Number.isFinite(v) ? v : undefined;
};

const str = (args: Args, key: string): string | undefined => {
  const v = args[key];
  return typeof v === 'string' ? v : undefined;
};

/** « X 12, Y 4 » (absolu) ou « ΔX +5, ΔY 0 » (relatif) pour les clés fournies, avec un suffixe optionnel (°). */
function coords(args: Args, keys: readonly string[], labels: readonly string[], relative: boolean, unit = ''): string[] {
  const out: string[] = [];
  keys.forEach((key, i) => {
    const v = num(args, key);
    if (v === undefined) return;
    const label = labels[i] ?? key;
    const value = relative ? (Number.isInteger(v) ? formatSigned(v) : formatSigned(v, 1)) : formatCm(v);
    out.push(`${relative ? `Δ${label}` : label} ${value}${unit}`);
  });
  return out;
}

const XYZ = ['x', 'y', 'z'] as const;
const XYZ_LABELS = ['X', 'Y', 'Z'] as const;
const ANGLES = ['yaw', 'pitch', 'roll'] as const;
const ANGLE_LABELS = ['lacet', 'tangage', 'roulis'] as const;

/** Titre d'une ligne d'appel d'outil, en français, avec ses arguments en clair. */
export function toolTitle(tool: string, args: Args): string {
  const relative = str(args, 'mode') === 'relative';
  switch (tool) {
    case 'get_status':
      return 'État demandé';
    case 'get_views': {
      const raw = args['cameras'];
      const cams = Array.isArray(raw) ? raw.filter((c): c is string => typeof c === 'string') : [];
      return `Vues demandées : ${(cams.length > 0 ? cams : ALL_CAMERAS).join(', ')}`;
    }
    case 'move_camera': {
      const parts = [
        ...coords(args, ['dx', 'dy', 'dz'], ['dX', 'dY', 'dZ'], false),
        ...coords(args, ['yaw', 'tilt'], ['lacet', 'tangage'], false, '°'),
      ].map((p) => p.replace(/^(d[XYZ]|lacet|tangage) (?![+−])/, '$1 +'));
      const zoom = num(args, 'zoom');
      if (zoom !== undefined) parts.push(`zoom ×${formatNum(zoom, 1)}`);
      return `Caméra ${str(args, 'camera') ?? '?'} : ${parts.length > 0 ? parts.join(', ') : 'sans changement'}`;
    }
    case 'move_scissors': {
      const parts = coords(args, XYZ, XYZ_LABELS, relative);
      return relative ? `Ciseaux : ${parts.join(', ')}` : `Ciseaux → ${parts.join(', ')}`;
    }
    case 'rotate_scissors': {
      const parts = coords(args, ANGLES, ANGLE_LABELS, relative, '°').map((p) => p.replace(/^Δ/, ''));
      return `${relative ? 'Ciseaux tournés' : 'Ciseaux orientés'} : ${parts.length > 0 ? parts.join(', ') : 'sans changement'}`;
    }
    case 'open_scissors':
      return 'Ciseaux ouverts';
    case 'cut':
      return 'Coupe';
    case 'move_basket': {
      const parts = coords(args, ['x', 'y'], ['X', 'Y'], relative);
      return relative ? `Panier : ${parts.join(', ')}` : `Panier → ${parts.join(', ')}`;
    }
    case 'report': {
      const outcome = str(args, 'outcome');
      const label = outcome === 'harvested' || outcome === 'missed' || outcome === 'aborted' ? OUTCOME_LABEL[outcome] : (outcome ?? '?');
      return `Rapport : ${label}`;
    }
    default:
      return `Outil ${tool}`;
  }
}

export function eventTitle(e: SimEvent): string {
  switch (e.type) {
    case 'ripe_detected':
      return `Tomate ${e.tomatoId} mûre détectée (${e.detector}, ${formatNum(e.confidence, 2)})`;
    case 'tomato_landed':
      return e.inBasket ? `Tomate ${e.tomatoId} dans le panier` : `Tomate ${e.tomatoId} tombée au sol`;
    case 'plant_regenerated':
      return `Nouveau plant (graine ${e.seed})`;
  }
}

export function phaseTitle(phase: Phase): string {
  return `Phase ${PHASE_LABEL[phase]}`;
}

export function snapshotTitle(phase: Phase): string {
  return `État reçu du serveur, phase ${PHASE_LABEL[phase]}`;
}

export function episodeStartTitle(m: Extract<ServerToDashboard, { type: 'episode_start' }>): string {
  return `Épisode ${m.episodeId} : tomate ${m.tomatoId}, ${m.sessionResumed ? 'session reprise' : 'nouvelle session'}`;
}

export function episodeEndTitle(m: Extract<ServerToDashboard, { type: 'episode_end' }>): string {
  return `Épisode terminé : ${OUTCOME_LABEL[m.outcome]}, ${m.toolCalls} appels, ${formatDuration(m.durationMs)}, ${formatCost(m.costUsd)}`;
}

export function viewsTitle(cameras: readonly CameraId[]): string {
  return `Vues rendues : ${cameras.join(', ')}`;
}
```

- [ ] **Step 5: Vérifier le succès**

Run: `npx vitest run packages/sim/src/dashboard/traceFormat.test.ts`
Expected: PASS, 8 tests.

- [ ] **Step 6: Commit**

```bash
git add packages/sim/src/dashboard/dashboardTypes.ts packages/sim/src/dashboard/bridgeTypes.ts packages/sim/src/dashboard/initialState.ts packages/sim/src/dashboard/traceFormat.ts packages/sim/src/dashboard/traceFormat.test.ts
git commit -m "feat(dashboard): types de l'état, contrat de pont côté dashboard, mise en forme française de la trace"
```

---

### Task 3: Réducteur pur et store

**Files:**
- Create: `packages/sim/src/dashboard/reduceServer.ts`, `reduceLocal.ts`, `dashboardStore.ts`, `dashboardStore.test.ts`

**Interfaces:**
- Consumes: `ServerToDashboard` de `@tomato/shared` ; types et `traceFormat` de la Task 2.
- Produces:
  - `const TRACE_MAX = 200`, `const TEXT_TITLE_MAX = 160`, `reduceServer(state: DashboardState, m: ServerToDashboard, nowMs: number): DashboardState`
  - `reduceLocal(state: DashboardState, m: LocalMessage): DashboardState`
  - `reduce(state: DashboardState, message: DashboardMessage, nowMs = Date.now()): DashboardState`
  - `interface DashboardStore { get(): DashboardState; dispatch(message: DashboardMessage, nowMs?: number): void; subscribe(fn: () => void): () => void }`, `createDashboardStore(initial = initialDashboardState()): DashboardStore`
- Règles : trace plus récent en tête, coupée à 200 ; `tool_call_result` complète l'entrée `tool` de même `callId` (ok, durée, résumé en détail) ou crée une entrée si aucune ; `episode_end` incrémente le compteur de son issue, cumule le coût, ferme l'épisode, `ok = outcome === 'harvested'` ; `views` remplace les images par caméra et pose `lastViewsAt = nowMs` ; `block_activity` pose `blocks = { active: to, flow, atMs: nowMs }` sans entrée de trace ; `local_reset` repart de l'état initial en gardant `ui`, `model`, `connection`.

- [ ] **Step 1: Test du réducteur et du store (échoue)**

`packages/sim/src/dashboard/dashboardStore.test.ts` :

```ts
import { describe, expect, it } from 'vitest';
import { createDefaultWorld, type ServerToDashboard, type ViewsResult } from '@tomato/shared';
import { TRACE_MAX, createDashboardStore, initialDashboardState, reduce } from './dashboardStore';
import type { DashboardState } from './dashboardTypes';

const world = createDefaultWorld(1);
const T0 = 1_700_000_000_000;

const views: ViewsResult = {
  images: [{ camera: 'front', pngBase64: 'iVBOR', widthPx: 800, heightPx: 800 }],
  json: {
    simTimeS: 3.5, phase: 'idle', targetTomatoId: null, tomatoes: [],
    scissors: world.scissors, basket: world.basket, cameras: world.cameras, limits: world.limits,
  },
};

function run(messages: ServerToDashboard[], start: DashboardState = initialDashboardState()): DashboardState {
  return messages.reduce((s, m, i) => reduce(s, m, T0 + i * 100), start);
}

describe('reduce — messages serveur', () => {
  it('snapshot sets phase, sim clock, episode and logs one event', () => {
    const s = run([{ type: 'snapshot', state: { ...world, simTimeS: 12, timeScale: 5, paused: true, targetTomatoId: 4 }, phase: 'detected', episodeId: 'e1' }]);
    expect(s.phase).toBe('detected');
    expect(s.phaseAtMs).toBe(T0);
    expect(s.sim).toEqual({ simTimeS: 12, timeScale: 5, paused: true });
    expect(s.episode).toEqual({ id: 'e1', tomatoId: 4, startedAtMs: T0 });
    expect(s.trace.map((e) => e.kind)).toEqual(['event']);
  });

  it('phase logs a phase entry with the reason as detail', () => {
    const s = run([{ type: 'phase', phase: 'harvesting', reason: 'premier mouvement' }]);
    expect(s.phase).toBe('harvesting');
    expect(s.trace[0]).toMatchObject({ kind: 'phase', title: 'Phase récolte', detail: 'premier mouvement', atMs: T0 });
  });

  it('episode_start opens the episode; episode_end counts the outcome, adds the cost and closes it', () => {
    const s = run([
      { type: 'episode_start', episodeId: 'e1', tomatoId: 2, sessionResumed: false },
      { type: 'episode_end', episodeId: 'e1', outcome: 'missed', note: 'panier trop à gauche', toolCalls: 5, costUsd: 0.02, durationMs: 2500 },
      { type: 'episode_end', episodeId: 'e2', outcome: 'harvested', note: '', toolCalls: 7, costUsd: 0.03, durationMs: 4000 },
    ]);
    expect(s.episode).toBeNull();
    expect(s.counters).toEqual({ harvested: 1, missed: 1, aborted: 0 });
    expect(s.costUsd).toBeCloseTo(0.05);
    expect(s.trace[1]).toMatchObject({ kind: 'event', ok: false, detail: 'panier trop à gauche', durationMs: 2500 });
    expect(s.trace[0]).toMatchObject({ kind: 'event', ok: true });
    expect(s.trace[2]).toMatchObject({ kind: 'event', title: 'Épisode e1 : tomate 2, nouvelle session' });
  });

  it('agent_text keeps the first line as title and the whole text as detail when longer', () => {
    const s = run([
      { type: 'agent_text', episodeId: 'e1', text: 'Je regarde.' },
      { type: 'agent_text', episodeId: 'e1', text: 'Première ligne\nDeuxième ligne' },
    ]);
    expect(s.trace[1]).toMatchObject({ kind: 'text', title: 'Je regarde.' });
    expect(s.trace[1]?.detail).toBeUndefined();
    expect(s.trace[0]).toMatchObject({ kind: 'text', title: 'Première ligne', detail: 'Première ligne\nDeuxième ligne' });
  });

  it('tool_call_start adds a pending tool entry and tool_call_result completes it in place', () => {
    const s = run([
      { type: 'tool_call_start', episodeId: 'e1', callId: 'c1', tool: 'move_scissors', args: { x: 12, y: 4, z: 38, mode: 'absolute' } },
      { type: 'agent_text', episodeId: 'e1', text: 'entre-temps' },
      { type: 'tool_call_result', episodeId: 'e1', callId: 'c1', ok: false, summary: 'collision : X 9, Y 4, Z 40', durationMs: 180 },
    ]);
    expect(s.trace).toHaveLength(2);
    expect(s.trace[1]).toMatchObject({ kind: 'tool', title: 'Ciseaux → X 12, Y 4, Z 38', ok: false, detail: 'collision : X 9, Y 4, Z 40', durationMs: 180 });
  });

  it('an unmatched tool_call_result becomes its own entry', () => {
    const s = run([{ type: 'tool_call_result', episodeId: 'e1', callId: 'zz', ok: true, summary: 'ciseaux en X 8', durationMs: 40 }]);
    expect(s.trace[0]).toMatchObject({ kind: 'tool', title: 'ciseaux en X 8', ok: true, durationMs: 40 });
  });

  it('views stores each image by camera, stamps lastViewsAt and copies the sim time', () => {
    const s = run([{ type: 'views', episodeId: 'e1', result: views }]);
    expect(s.views.front?.pngBase64).toBe('iVBOR');
    expect(s.views.top).toBeNull();
    expect(s.lastViewsAt).toBe(T0);
    expect(s.sim.simTimeS).toBe(3.5);
    expect(s.trace[0]?.title).toBe('Vues rendues : front');
  });

  it('sim_event logs an event; tomato_landed carries ok = inBasket', () => {
    const s = run([
      { type: 'sim_event', event: { type: 'ripe_detected', tomatoId: 3, detector: 'yolo', confidence: 0.9 } },
      { type: 'sim_event', event: { type: 'tomato_landed', tomatoId: 3, inBasket: false } },
    ]);
    expect(s.trace[1]).toMatchObject({ kind: 'event', title: 'Tomate 3 mûre détectée (yolo, 0,90)' });
    expect(s.trace[1]?.ok).toBeUndefined();
    expect(s.trace[0]).toMatchObject({ kind: 'event', title: 'Tomate 3 tombée au sol', ok: false });
  });

  it('block_activity lights the target block with a flash timestamp and adds no trace entry', () => {
    const s = run([{ type: 'block_activity', from: 'server', to: 'agent', label: 'réveil' }]);
    expect(s.blocks).toEqual({ active: 'agent', flow: { from: 'server', to: 'agent', label: 'réveil' }, atMs: T0 });
    expect(s.trace).toEqual([]);
  });

  it('keeps the trace newest-first and capped at TRACE_MAX', () => {
    const msgs: ServerToDashboard[] = Array.from({ length: TRACE_MAX + 50 }, (_, i) => ({ type: 'agent_text', episodeId: 'e', text: `t${i}` }));
    const s = run(msgs);
    expect(s.trace).toHaveLength(TRACE_MAX);
    expect(s.trace[0]?.title).toBe(`t${TRACE_MAX + 49}`);
    expect(s.trace[TRACE_MAX - 1]?.title).toBe('t50');
    expect(s.nextTraceId).toBe(TRACE_MAX + 51);
  });
});

describe('reduce — messages locaux', () => {
  it('toggles the interface flags and the enlarged view', () => {
    let s = initialDashboardState();
    s = reduce(s, { type: 'local_toggle_controls' });
    s = reduce(s, { type: 'local_toggle_agent_view' });
    s = reduce(s, { type: 'local_toggle_diagram' });
    s = reduce(s, { type: 'local_enlarge', camera: 'side' });
    expect(s.ui).toEqual({ controlsHidden: true, agentView: true, diagramOpen: false, enlarged: 'side' });
  });

  it('local_reset clears the episode data but keeps ui, model and connection', () => {
    let s = run([{ type: 'agent_text', episodeId: 'e', text: 'x' }, { type: 'views', episodeId: 'e', result: views }]);
    s = reduce(s, { type: 'local_connection', connection: 'replay' });
    s = reduce(s, { type: 'local_model', model: 'claude-test' });
    s = reduce(s, { type: 'local_toggle_agent_view' });
    s = reduce(s, { type: 'local_reset' });
    expect(s.trace).toEqual([]);
    expect(s.views.front).toBeNull();
    expect(s.connection).toBe('replay');
    expect(s.model).toBe('claude-test');
    expect(s.ui.agentView).toBe(true);
  });
});

describe('createDashboardStore', () => {
  it('notifies subscribers on real changes only and exposes an immutable snapshot', () => {
    const store = createDashboardStore();
    let calls = 0;
    const off = store.subscribe(() => calls++);
    const before = store.get();
    store.dispatch({ type: 'local_connection', connection: 'disconnected' });
    expect(calls).toBe(0);
    expect(store.get()).toBe(before);
    store.dispatch({ type: 'phase', phase: 'detected', reason: 'r' }, T0);
    expect(calls).toBe(1);
    expect(store.get()).not.toBe(before);
    expect(store.get().trace[0]?.atMs).toBe(T0);
    off();
    store.dispatch({ type: 'phase', phase: 'harvesting', reason: 'r' });
    expect(calls).toBe(1);
  });
});
```

- [ ] **Step 2: Vérifier l'échec**

Run: `npx vitest run packages/sim/src/dashboard/dashboardStore.test.ts`
Expected: FAIL, module `./dashboardStore` introuvable.

- [ ] **Step 3: Écrire `reduceServer.ts`**

```ts
import type { ServerToDashboard } from '@tomato/shared';
import type { Counters, DashboardState, TraceEntry } from './dashboardTypes';
import {
  episodeEndTitle, episodeStartTitle, eventTitle, firstLine, phaseTitle, snapshotTitle, toolTitle, viewsTitle,
} from './traceFormat';

/** Nombre maximal d'entrées conservées dans la trace (spec : 200). */
export const TRACE_MAX = 200;
/** Longueur maximale du titre d'un texte de l'agent ; le reste va dans `detail`. */
export const TEXT_TITLE_MAX = 160;

type EntryInput = Omit<TraceEntry, 'id' | 'atMs'>;

/** Ajoute une entrée en tête de trace (plus récent en haut) et coupe à TRACE_MAX. */
function push(state: DashboardState, entry: EntryInput, nowMs: number): DashboardState {
  const full: TraceEntry = { ...entry, id: state.nextTraceId, atMs: nowMs };
  return { ...state, nextTraceId: state.nextTraceId + 1, trace: [full, ...state.trace].slice(0, TRACE_MAX) };
}

/** Réducteur pur des messages serveur → dashboard. `nowMs` horodate la trace et les flashs. */
export function reduceServer(state: DashboardState, m: ServerToDashboard, nowMs: number): DashboardState {
  switch (m.type) {
    case 'snapshot': {
      const episode =
        m.episodeId === null
          ? null
          : state.episode?.id === m.episodeId
            ? state.episode
            : { id: m.episodeId, tomatoId: m.state.targetTomatoId ?? -1, startedAtMs: nowMs };
      const sim = { simTimeS: m.state.simTimeS, timeScale: m.state.timeScale, paused: m.state.paused };
      return push({ ...state, phase: m.phase, phaseAtMs: nowMs, episode, sim }, { kind: 'event', title: snapshotTitle(m.phase) }, nowMs);
    }
    case 'phase':
      return push({ ...state, phase: m.phase, phaseAtMs: nowMs }, { kind: 'phase', title: phaseTitle(m.phase), detail: m.reason }, nowMs);
    case 'episode_start':
      return push(
        { ...state, episode: { id: m.episodeId, tomatoId: m.tomatoId, startedAtMs: nowMs } },
        { kind: 'event', title: episodeStartTitle(m) },
        nowMs,
      );
    case 'episode_end': {
      const counters: Counters = { ...state.counters };
      counters[m.outcome] += 1;
      return push(
        { ...state, counters, costUsd: state.costUsd + m.costUsd, episode: null },
        { kind: 'event', title: episodeEndTitle(m), detail: m.note, ok: m.outcome === 'harvested', durationMs: m.durationMs },
        nowMs,
      );
    }
    case 'agent_text': {
      const text = m.text.trim();
      const title = firstLine(text, TEXT_TITLE_MAX);
      return push(state, title === text ? { kind: 'text', title } : { kind: 'text', title, detail: text }, nowMs);
    }
    case 'tool_call_start':
      return push(state, { kind: 'tool', title: toolTitle(m.tool, m.args), callId: m.callId }, nowMs);
    case 'tool_call_result': {
      const idx = state.trace.findIndex((e) => e.kind === 'tool' && e.callId === m.callId);
      const prev = idx === -1 ? undefined : state.trace[idx];
      if (prev === undefined) {
        return push(state, { kind: 'tool', title: m.summary, ok: m.ok, durationMs: m.durationMs, callId: m.callId }, nowMs);
      }
      const trace = state.trace.slice();
      trace[idx] = { ...prev, ok: m.ok, durationMs: m.durationMs, detail: m.summary };
      return { ...state, trace };
    }
    case 'views': {
      const views = { ...state.views };
      for (const img of m.result.images) views[img.camera] = img;
      const sim = { ...state.sim, simTimeS: m.result.json.simTimeS };
      const title = viewsTitle(m.result.images.map((i) => i.camera));
      return push({ ...state, views, lastViewsAt: nowMs, sim }, { kind: 'event', title }, nowMs);
    }
    case 'sim_event':
      return push(
        state,
        m.event.type === 'tomato_landed'
          ? { kind: 'event', title: eventTitle(m.event), ok: m.event.inBasket }
          : { kind: 'event', title: eventTitle(m.event) },
        nowMs,
      );
    case 'block_activity':
      return { ...state, blocks: { active: m.to, flow: { from: m.from, to: m.to, label: m.label }, atMs: nowMs } };
  }
}
```

- [ ] **Step 4: Écrire `reduceLocal.ts`**

```ts
import type { DashboardState, LocalMessage } from './dashboardTypes';
import { initialDashboardState } from './initialState';

/** Réducteur pur des messages locaux (connexion, replay, interface). */
export function reduceLocal(state: DashboardState, m: LocalMessage): DashboardState {
  switch (m.type) {
    case 'local_connection':
      return state.connection === m.connection ? state : { ...state, connection: m.connection };
    case 'local_reset':
      // Début d'un replay : on repart d'une trace vide en gardant l'interface, le modèle et la connexion.
      return { ...initialDashboardState(state.model), connection: state.connection, ui: state.ui };
    case 'local_model':
      return state.model === m.model ? state : { ...state, model: m.model };
    case 'local_toggle_controls':
      return { ...state, ui: { ...state.ui, controlsHidden: !state.ui.controlsHidden } };
    case 'local_toggle_agent_view':
      return { ...state, ui: { ...state.ui, agentView: !state.ui.agentView } };
    case 'local_toggle_diagram':
      return { ...state, ui: { ...state.ui, diagramOpen: !state.ui.diagramOpen } };
    case 'local_enlarge':
      return state.ui.enlarged === m.camera ? state : { ...state, ui: { ...state.ui, enlarged: m.camera } };
  }
}
```

- [ ] **Step 5: Écrire `dashboardStore.ts`**

```ts
import type { ServerToDashboard } from '@tomato/shared';
import type { DashboardMessage, DashboardState, LocalMessage } from './dashboardTypes';
import { initialDashboardState } from './initialState';
import { reduceLocal } from './reduceLocal';
import { reduceServer } from './reduceServer';

export { DEFAULT_MODEL, initialDashboardState } from './initialState';
export { TRACE_MAX } from './reduceServer';

function isLocal(m: DashboardMessage): m is LocalMessage {
  return m.type.startsWith('local_');
}

/** Réducteur pur : messages du serveur (`ServerToDashboard`) et messages locaux (`local_*`). */
export function reduce(state: DashboardState, message: DashboardMessage, nowMs: number = Date.now()): DashboardState {
  return isLocal(message) ? reduceLocal(state, message) : reduceServer(state, message as ServerToDashboard, nowMs);
}

/** Store minimal compatible avec `useSyncExternalStore` (snapshot immuable, abonnés notifiés sur changement réel). */
export interface DashboardStore {
  get(): DashboardState;
  dispatch(message: DashboardMessage, nowMs?: number): void;
  subscribe(fn: () => void): () => void;
}

export function createDashboardStore(initial: DashboardState = initialDashboardState()): DashboardStore {
  let state = initial;
  const listeners = new Set<() => void>();
  return {
    get: () => state,
    dispatch: (message, nowMs = Date.now()) => {
      const next = reduce(state, message, nowMs);
      if (next === state) return;
      state = next;
      for (const fn of listeners) fn();
    },
    subscribe: (fn) => {
      listeners.add(fn);
      return () => {
        listeners.delete(fn);
      };
    },
  };
}
```

- [ ] **Step 6: Vérifier le succès**

Run: `npx vitest run packages/sim/src/dashboard/dashboardStore.test.ts`
Expected: PASS, 13 tests.

- [ ] **Step 7: Commit**

```bash
git add packages/sim/src/dashboard/reduceServer.ts packages/sim/src/dashboard/reduceLocal.ts packages/sim/src/dashboard/dashboardStore.ts packages/sim/src/dashboard/dashboardStore.test.ts
git commit -m "feat(dashboard): réducteur pur des messages serveur et locaux, store compatible useSyncExternalStore"
```

---

### Task 4: Pont : slot, garde M5, garde M4, API des épisodes

**Files:**
- Create: `packages/sim/src/dashboard/bridgeSlot.ts`, `bridgeSlot.test.ts`, `bridgeLoader.ts`, `bridgeLoader.test.ts`, `perceptionInfo.ts`, `perceptionInfo.test.ts`, `episodesApi.ts`, `episodesApi.test.ts`

**Interfaces:**
- Consumes: `createFakeBridge` (Task 1, tests seulement), `DashboardStore` (Task 3), `SimRuntime` de `core/runtime`, `createRuntime` (tests).
- Produces:
  - `type SlotMode = 'none' | 'live' | 'replay'`, `interface BridgeSlot { setLive(bridge: DashboardBridge | null): void; play(bridge: DashboardBridge): void; stop(): void; mode(): SlotMode }`, `createBridgeSlot(store: DashboardStore): BridgeSlot`
  - `const WS_URL = 'ws://localhost:7332'`, `interface LiveBridgeOptions { url: string; runtime: SimRuntime; renderViews: (cameras: CameraId[]) => Promise<ViewsResult> }`, `type ModuleLoader = () => Promise<unknown>`, `loadLiveBridge(opts: LiveBridgeOptions, candidates?: Record<string, ModuleLoader>): Promise<DashboardBridge | null>`
  - `interface PerceptionInfo { opencvReady: boolean; yoloReady: boolean; lastDetector: 'yolo' | 'hsv' | null }`, `type PerceptionReader = () => PerceptionInfo`, `loadPerceptionState(candidates?): Promise<PerceptionReader | null>`, `detectorLabel(info: PerceptionInfo | null): string` (« HSV/Sobel » sans M4)
  - `const SERVER_HTTP_URL = 'http://localhost:7331'`, `interface EpisodeSummary { episodeId; startedAt; outcome; tomatoId }`, `interface EpisodeFile { episodeId; messages: ScriptEntry[] }`, `isEpisodeSummary(x)`, `isEpisodeFile(x)`, `toScript(file: EpisodeFile, speed: number): ScriptEntry[]`, `scriptDurationMs(script)`, `listEpisodes(baseUrl?)`, `loadEpisode(episodeId, baseUrl?)`, `fetchServerModel(baseUrl?): Promise<string | null>`
- Note : `import.meta.glob` est résolu par Vite à la compilation ; sans fichier correspondant il vaut `{}`. Les tests injectent leurs propres candidats, ils ne dépendent donc ni de M5 ni de M4.

- [ ] **Step 1: Tests (échouent)**

`packages/sim/src/dashboard/bridgeSlot.test.ts` :

```ts
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ServerToDashboard } from '@tomato/shared';
import { createFakeBridge } from '../bridge/fakeBridge';
import { createBridgeSlot } from './bridgeSlot';
import type { DashboardBridge } from './bridgeTypes';
import { createDashboardStore } from './dashboardStore';

const phase = (p: 'detected' | 'harvesting' | 'cutting'): ServerToDashboard => ({ type: 'phase', phase: p, reason: 'test' });

describe('createBridgeSlot', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('accepts a fake bridge as a DashboardBridge (structural compatibility with the M5 contract)', () => {
    const bridge: DashboardBridge = createFakeBridge([]);
    expect(bridge.status()).toBe('connected');
  });

  it('setLive feeds the store and reports the connection; setLive(null) reports disconnected', () => {
    const store = createDashboardStore();
    const slot = createBridgeSlot(store);
    slot.setLive(createFakeBridge([{ atMs: 10, message: phase('detected') }]));
    expect(store.get().connection).toBe('connected');
    expect(slot.mode()).toBe('live');
    vi.advanceTimersByTime(10);
    expect(store.get().phase).toBe('detected');
    slot.setLive(null);
    expect(store.get().connection).toBe('disconnected');
    expect(slot.mode()).toBe('none');
  });

  it('play resets the store, ignores the live bridge meanwhile, and stop restores it', () => {
    const store = createDashboardStore();
    const slot = createBridgeSlot(store);
    const live = createFakeBridge([{ atMs: 50, message: phase('cutting') }, { atMs: 150, message: phase('harvesting') }]);
    slot.setLive(live);
    store.dispatch(phase('detected'));
    expect(store.get().trace).toHaveLength(1);

    slot.play(createFakeBridge([{ atMs: 20, message: phase('detected') }]));
    expect(slot.mode()).toBe('replay');
    expect(store.get().connection).toBe('replay');
    expect(store.get().trace).toHaveLength(0);
    vi.advanceTimersByTime(60); // replay message at 20 arrives, live message at 50 is ignored
    expect(store.get().trace.map((e) => e.title)).toEqual(['Phase détectée']);

    slot.stop();
    expect(slot.mode()).toBe('live');
    expect(store.get().connection).toBe('connected');
    vi.advanceTimersByTime(100); // live message at 150 arrives
    expect(store.get().phase).toBe('harvesting');
  });

  it('stop without a live bridge reports disconnected, and a closed replay bridge propagates its status', () => {
    const store = createDashboardStore();
    const slot = createBridgeSlot(store);
    const replay = createFakeBridge([]);
    slot.play(replay);
    replay.close();
    expect(store.get().connection).toBe('replay');
    slot.stop();
    expect(store.get().connection).toBe('disconnected');
    expect(slot.mode()).toBe('none');
  });
});
```

`packages/sim/src/dashboard/bridgeLoader.test.ts` :

```ts
import { describe, expect, it, vi } from 'vitest';
import { createDefaultWorld } from '@tomato/shared';
import { createRuntime } from '../core/runtime';
import { createFakeBridge } from '../bridge/fakeBridge';
import { loadLiveBridge, type LiveBridgeOptions } from './bridgeLoader';

async function options(): Promise<LiveBridgeOptions> {
  const runtime = await createRuntime(createDefaultWorld(1), null, []);
  return { url: 'ws://localhost:7332', runtime, renderViews: () => Promise.reject(new Error('no views')) };
}

describe('loadLiveBridge', () => {
  it('returns null when no bridge module exists (M5 not merged)', async () => {
    expect(await loadLiveBridge(await options(), {})).toBeNull();
  });

  it('returns null when the module has no createBridge export', async () => {
    expect(await loadLiveBridge(await options(), { '../bridge/createBridge.ts': async () => ({}) })).toBeNull();
  });

  it('calls createBridge with the options and returns its bridge', async () => {
    const bridge = createFakeBridge([]);
    const createBridge = vi.fn(() => bridge);
    const opts = await options();
    const got = await loadLiveBridge(opts, { '../bridge/createBridge.ts': async () => ({ createBridge }) });
    expect(got).toBe(bridge);
    expect(createBridge).toHaveBeenCalledWith(opts);
  });
});
```

`packages/sim/src/dashboard/perceptionInfo.test.ts` :

```ts
import { describe, expect, it } from 'vitest';
import { detectorLabel, loadPerceptionState } from './perceptionInfo';

describe('perceptionInfo', () => {
  it('reads perceptionState from a candidate module, or null when M4 is absent', async () => {
    expect(await loadPerceptionState({})).toBeNull();
    expect(await loadPerceptionState({ a: async () => ({}) })).toBeNull();
    const reader = await loadPerceptionState({
      a: async () => ({ perceptionState: () => ({ opencvReady: true, yoloReady: false, lastDetector: 'hsv' as const }) }),
    });
    expect(reader?.()).toEqual({ opencvReady: true, yoloReady: false, lastDetector: 'hsv' });
  });

  it('labels detector and edge filter, with the HSV/Sobel fallback', () => {
    expect(detectorLabel(null)).toBe('HSV/Sobel');
    expect(detectorLabel({ opencvReady: true, yoloReady: true, lastDetector: 'yolo' })).toBe('yolo/Canny');
    expect(detectorLabel({ opencvReady: false, yoloReady: false, lastDetector: null })).toBe('hsv/Sobel');
  });
});
```

`packages/sim/src/dashboard/episodesApi.test.ts` :

```ts
import { afterEach, describe, expect, it, vi } from 'vitest';
import { fetchServerModel, isEpisodeFile, listEpisodes, loadEpisode, scriptDurationMs, toScript } from './episodesApi';

const file = {
  episodeId: 'e1',
  messages: [
    { atMs: 1300, message: { type: 'phase', phase: 'harvesting', reason: 'b' } as const },
    { atMs: 1000, message: { type: 'phase', phase: 'detected', reason: 'a' } as const },
    { atMs: 2000, message: { type: 'phase', phase: 'idle', reason: 'c' } as const },
  ],
};

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

describe('toScript', () => {
  it('sorts, rebases at 0 and scales by the speed', () => {
    const s = toScript(file, 2);
    expect(s.map((e) => e.atMs)).toEqual([0, 150, 500]);
    expect(s.map((e) => (e.message.type === 'phase' ? e.message.phase : ''))).toEqual(['detected', 'harvesting', 'idle']);
    expect(scriptDurationMs(s)).toBe(500);
    expect(toScript(file, 1).map((e) => e.atMs)).toEqual([0, 300, 1000]);
    expect(scriptDurationMs([])).toBe(0);
  });
});

describe('isEpisodeFile', () => {
  it('accepts the journal shape and rejects anything else', () => {
    expect(isEpisodeFile(file)).toBe(true);
    expect(isEpisodeFile({ episodeId: 'e', messages: [{ atMs: 'x', message: { type: 'phase' } }] })).toBe(false);
    expect(isEpisodeFile({ messages: [] })).toBe(false);
    expect(isEpisodeFile(null)).toBe(false);
  });
});

describe('HTTP helpers', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('listEpisodes keeps only well-formed summaries and loadEpisode validates the file', async () => {
    const fetchMock = vi.fn(async (url: string | URL | Request) => {
      const u = String(url);
      if (u.endsWith('/episodes')) return jsonResponse([{ episodeId: 'e1', startedAt: 's', outcome: 'harvested', tomatoId: 1 }, { nope: 1 }]);
      if (u.endsWith('/episodes/e1')) return jsonResponse(file);
      return jsonResponse({}, 404);
    });
    vi.stubGlobal('fetch', fetchMock);
    expect((await listEpisodes('http://x')).map((e) => e.episodeId)).toEqual(['e1']);
    expect((await loadEpisode('e1', 'http://x')).messages).toHaveLength(3);
    await expect(loadEpisode('missing', 'http://x')).rejects.toThrow(/404/);
  });

  it('fetchServerModel returns the model when /health exposes it, null otherwise', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse({ ok: true, model: 'claude-test' })));
    expect(await fetchServerModel('http://x')).toBe('claude-test');
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse({ ok: true })));
    expect(await fetchServerModel('http://x')).toBeNull();
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('ECONNREFUSED'); }));
    expect(await fetchServerModel('http://x')).toBeNull();
  });
});
```

- [ ] **Step 2: Vérifier l'échec**

Run: `npx vitest run packages/sim/src/dashboard/bridgeSlot.test.ts packages/sim/src/dashboard/bridgeLoader.test.ts packages/sim/src/dashboard/perceptionInfo.test.ts packages/sim/src/dashboard/episodesApi.test.ts`
Expected: FAIL, modules introuvables.

- [ ] **Step 3: Écrire `bridgeSlot.ts`**

```ts
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
}

export function createBridgeSlot(store: DashboardStore): BridgeSlot {
  let live: DashboardBridge | null = null;
  let replay: DashboardBridge | null = null;
  let unsubscribe: (() => void)[] = [];

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
  };
}
```

- [ ] **Step 4: Écrire `bridgeLoader.ts`**

```ts
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
```

- [ ] **Step 5: Écrire `perceptionInfo.ts`**

```ts
/** Sous-ensemble de `perceptionState()` exporté par M4 (contrat Étape 3). */
export interface PerceptionInfo {
  opencvReady: boolean;
  yoloReady: boolean;
  lastDetector: 'yolo' | 'hsv' | null;
}

export type PerceptionReader = () => PerceptionInfo;
type ModuleLoader = () => Promise<unknown>;

/** M4 n'est peut-être pas mergé : le glob renvoie un objet vide si aucun de ces fichiers n'existe. */
const CANDIDATES: Record<string, ModuleLoader> = import.meta.glob(['../perception/perceptionModule.ts', '../perception/index.ts']);

export async function loadPerceptionState(candidates: Record<string, ModuleLoader> = CANDIDATES): Promise<PerceptionReader | null> {
  for (const load of Object.values(candidates)) {
    const mod = (await load()) as { perceptionState?: unknown };
    if (typeof mod.perceptionState === 'function') return mod.perceptionState as PerceptionReader;
  }
  return null;
}

/** « détecteur/contours » affiché dans le bandeau ; sans M4 : « HSV/Sobel » (contrat Étape 3). */
export function detectorLabel(info: PerceptionInfo | null): string {
  if (info === null) return 'HSV/Sobel';
  const detector = info.lastDetector ?? (info.yoloReady ? 'yolo' : 'hsv');
  return `${detector}/${info.opencvReady ? 'Canny' : 'Sobel'}`;
}
```

- [ ] **Step 6: Écrire `episodesApi.ts`**

```ts
import type { ScriptEntry } from './bridgeTypes';

/** HTTP annexe du serveur M5 : GET /health, GET /episodes, GET /episodes/:id (contrat Étape 3). */
export const SERVER_HTTP_URL = 'http://localhost:7331';

export interface EpisodeSummary {
  episodeId: string;
  startedAt: string;
  outcome: string;
  tomatoId: number;
}

/** Sous-ensemble du fichier d'épisode utilisé par le replay. */
export interface EpisodeFile {
  episodeId: string;
  messages: ScriptEntry[];
}

function isRecord(x: unknown): x is Record<string, unknown> {
  return typeof x === 'object' && x !== null;
}

export function isEpisodeSummary(x: unknown): x is EpisodeSummary {
  return isRecord(x) && typeof x['episodeId'] === 'string';
}

export function isEpisodeFile(x: unknown): x is EpisodeFile {
  if (!isRecord(x) || typeof x['episodeId'] !== 'string' || !Array.isArray(x['messages'])) return false;
  return x['messages'].every(
    (e: unknown) => isRecord(e) && typeof e['atMs'] === 'number' && isRecord(e['message']) && typeof e['message']['type'] === 'string',
  );
}

/** Scénario rejouable : trié, ramené à 0 et accéléré du facteur `speed` (2 = deux fois plus vite). */
export function toScript(file: EpisodeFile, speed: number): ScriptEntry[] {
  const sorted = file.messages.slice().sort((a, b) => a.atMs - b.atMs);
  const first = sorted[0]?.atMs ?? 0;
  const k = speed > 0 ? 1 / speed : 1;
  return sorted.map((e) => ({ atMs: Math.round((e.atMs - first) * k), message: e.message }));
}

export function scriptDurationMs(script: readonly ScriptEntry[]): number {
  return script.reduce((max, e) => Math.max(max, e.atMs), 0);
}

export async function listEpisodes(baseUrl: string = SERVER_HTTP_URL): Promise<EpisodeSummary[]> {
  const res = await fetch(`${baseUrl}/episodes`);
  if (!res.ok) throw new Error(`GET /episodes : HTTP ${res.status}`);
  const body: unknown = await res.json();
  return Array.isArray(body) ? body.filter(isEpisodeSummary) : [];
}

export async function loadEpisode(episodeId: string, baseUrl: string = SERVER_HTTP_URL): Promise<EpisodeFile> {
  const res = await fetch(`${baseUrl}/episodes/${encodeURIComponent(episodeId)}`);
  if (!res.ok) throw new Error(`GET /episodes/${episodeId} : HTTP ${res.status}`);
  const body: unknown = await res.json();
  if (!isEpisodeFile(body)) throw new Error(`épisode ${episodeId} : fichier invalide`);
  return body;
}

/** Modèle annoncé par `GET /health` (`{ model }`) si le serveur l'expose ; sinon null. */
export async function fetchServerModel(baseUrl: string = SERVER_HTTP_URL): Promise<string | null> {
  try {
    const res = await fetch(`${baseUrl}/health`);
    if (!res.ok) return null;
    const body: unknown = await res.json();
    return isRecord(body) && typeof body['model'] === 'string' ? body['model'] : null;
  } catch {
    return null;
  }
}
```

- [ ] **Step 7: Vérifier le succès**

Run: `npx vitest run packages/sim/src/dashboard/bridgeSlot.test.ts packages/sim/src/dashboard/bridgeLoader.test.ts packages/sim/src/dashboard/perceptionInfo.test.ts packages/sim/src/dashboard/episodesApi.test.ts`
Expected: PASS, 13 tests (4 + 3 + 2 + 4).

- [ ] **Step 8: Commit**

```bash
git add packages/sim/src/dashboard/bridgeSlot.ts packages/sim/src/dashboard/bridgeSlot.test.ts packages/sim/src/dashboard/bridgeLoader.ts packages/sim/src/dashboard/bridgeLoader.test.ts packages/sim/src/dashboard/perceptionInfo.ts packages/sim/src/dashboard/perceptionInfo.test.ts packages/sim/src/dashboard/episodesApi.ts packages/sim/src/dashboard/episodesApi.test.ts
git commit -m "feat(dashboard): slot de pont (réel ou replay), gardes de merge M5 et M4, API des épisodes et scénario de replay"
```

---

### Task 5: Scénario de démo et géométrie du schéma bloc (purs)

**Files:**
- Create: `packages/sim/src/dashboard/demoScript.ts`, `demoScript.test.ts`, `blockLayout.ts`, `blockLayout.test.ts`

**Interfaces:**
- Consumes: `BlockId`, `ServerToDashboard`, `ViewsResult`, `WorldState` de `@tomato/shared` ; `ScriptEntry` (Task 2) ; `createDashboardStore` (Task 3, test).
- Produces:
  - `const DEMO_EPISODE_ID = 'demo-0001'`, `buildDemoScript(views: ViewsResult | null, state: WorldState): ScriptEntry[]` : réveil → vues (si fournies) → panier → ciseaux avec une collision (`ok: false`) → rotation → descente → ouverture → coupe → chute → rapport → `episode_end` récoltée (0,0421 $) → phase `idle` ; 9 appels d'outils, chacun avec son résultat.
  - `interface BlockSpec { id: BlockId; label: string }`, `const BLOCKS`, `DIAGRAM_W = 1000`, `DIAGRAM_H = 92`, `BLOCK_W = 150`, `BLOCK_H = 36`, `BLOCK_Y = 8`, `BUS_Y = 76`, `BLOCK_GAP`, `blockIndex(id)`, `blockX(id)`, `blockCenterX(id)`, `busSegment(from, to): { x1; x2 }`

- [ ] **Step 1: Tests (échouent)**

`packages/sim/src/dashboard/demoScript.test.ts` :

```ts
import { describe, expect, it } from 'vitest';
import { createDefaultWorld, type ViewsResult } from '@tomato/shared';
import { createDashboardStore } from './dashboardStore';
import { buildDemoScript } from './demoScript';

const world = createDefaultWorld(1);
const views: ViewsResult = {
  images: [{ camera: 'top', pngBase64: 'iVBOR', widthPx: 800, heightPx: 800 }],
  json: { simTimeS: 1, phase: 'idle', targetTomatoId: null, tomatoes: [], scissors: world.scissors, basket: world.basket, cameras: world.cameras, limits: world.limits },
};

describe('buildDemoScript', () => {
  it('is time-ordered, starts with a snapshot and ends back in idle after a harvested episode', () => {
    const s = buildDemoScript(views, world);
    for (let i = 1; i < s.length; i++) expect(s[i]!.atMs).toBeGreaterThanOrEqual(s[i - 1]!.atMs);
    expect(s[0]?.message.type).toBe('snapshot');
    const phases = s.flatMap((e) => (e.message.type === 'phase' ? [e.message.phase] : []));
    expect(phases).toEqual(['detected', 'harvesting', 'cutting', 'falling', 'harvested', 'idle']);
    const end = s.find((e) => e.message.type === 'episode_end')?.message;
    expect(end?.type === 'episode_end' && end.outcome).toBe('harvested');
  });

  it('includes the views message only when views are given, and every tool call gets a result', () => {
    expect(buildDemoScript(views, world).some((e) => e.message.type === 'views')).toBe(true);
    expect(buildDemoScript(null, world).some((e) => e.message.type === 'views')).toBe(false);
    const s = buildDemoScript(null, world);
    const starts = s.flatMap((e) => (e.message.type === 'tool_call_start' ? [e.message.callId] : []));
    const results = s.flatMap((e) => (e.message.type === 'tool_call_result' ? [e.message.callId] : []));
    expect(starts).toHaveLength(9);
    expect(results.sort()).toEqual(starts.slice().sort());
  });

  it('played through the store, yields one harvested, one highlighted error and the views', () => {
    const store = createDashboardStore();
    for (const e of buildDemoScript(views, world)) store.dispatch(e.message, e.atMs);
    const st = store.get();
    expect(st.counters.harvested).toBe(1);
    expect(st.views.top?.pngBase64).toBe('iVBOR');
    expect(st.trace.filter((t) => t.ok === false).map((t) => t.title)).toEqual(['Ciseaux → X 8, Y −2, Z 41']);
    expect(st.costUsd).toBeCloseTo(0.0421);
    expect(st.trace[0]?.title).toBe('Phase repos');
  });
});
```

`packages/sim/src/dashboard/blockLayout.test.ts` :

```ts
import { describe, expect, it } from 'vitest';
import { BLOCKS, BLOCK_W, DIAGRAM_W, blockCenterX, blockIndex, blockX, busSegment } from './blockLayout';

describe('blockLayout', () => {
  it('lists the five blocks of the spec in flow order', () => {
    expect(BLOCKS.map((b) => b.id)).toEqual(['simulation', 'perception', 'server', 'agent', 'dashboard']);
    expect(blockIndex('server')).toBe(2);
  });

  it('places the blocks left to right without overlap inside the viewBox', () => {
    let prevRight = 0;
    for (const b of BLOCKS) {
      const x = blockX(b.id);
      expect(x).toBeGreaterThan(prevRight);
      prevRight = x + BLOCK_W;
    }
    expect(prevRight).toBeLessThan(DIAGRAM_W);
    expect(blockCenterX('simulation')).toBeCloseTo(blockX('simulation') + BLOCK_W / 2);
  });

  it('orders the bus segment from left to right whatever the direction of the flow', () => {
    const ab = busSegment('server', 'agent');
    const ba = busSegment('agent', 'server');
    expect(ab).toEqual(ba);
    expect(ab.x1).toBeCloseTo(blockCenterX('server'));
    expect(ab.x2).toBeCloseTo(blockCenterX('agent'));
  });
});
```

- [ ] **Step 2: Vérifier l'échec**

Run: `npx vitest run packages/sim/src/dashboard/demoScript.test.ts packages/sim/src/dashboard/blockLayout.test.ts`
Expected: FAIL, modules introuvables.

- [ ] **Step 3: Écrire `demoScript.ts`**

```ts
import type { BlockId, ServerToDashboard, ViewsResult, WorldState } from '@tomato/shared';
import type { ScriptEntry } from './bridgeTypes';

export const DEMO_EPISODE_ID = 'demo-0001';
const NOTE = 'Coupe réussie au deuxième essai après une collision.';

/**
 * Épisode scripté sans serveur ni Claude (test Playwright, vérification de fin d'étape) :
 * réveil, vues, panier, ciseaux avec une collision (erreur surlignée), coupe, chute, rapport.
 */
export function buildDemoScript(views: ViewsResult | null, state: WorldState): ScriptEntry[] {
  const tomatoId = state.tomatoes[0]?.id ?? 1;
  const ep = DEMO_EPISODE_ID;
  const at = (atMs: number, message: ServerToDashboard): ScriptEntry => ({ atMs, message });
  const call = (atMs: number, callId: string, tool: string, args: Record<string, unknown>): ScriptEntry =>
    at(atMs, { type: 'tool_call_start', episodeId: ep, callId, tool, args });
  const done = (atMs: number, callId: string, ok: boolean, summary: string, durationMs: number): ScriptEntry =>
    at(atMs, { type: 'tool_call_result', episodeId: ep, callId, ok, summary, durationMs });
  const flow = (atMs: number, from: BlockId, to: BlockId, label: string): ScriptEntry => at(atMs, { type: 'block_activity', from, to, label });
  const say = (atMs: number, text: string): ScriptEntry => at(atMs, { type: 'agent_text', episodeId: ep, text });
  const phase = (atMs: number, p: WorldState['phase'], reason: string): ScriptEntry => at(atMs, { type: 'phase', phase: p, reason });

  return [
    at(0, { type: 'snapshot', state, phase: 'idle', episodeId: null }),
    flow(200, 'perception', 'server', 'ripe_detected'),
    at(200, { type: 'sim_event', event: { type: 'ripe_detected', tomatoId, detector: 'hsv', confidence: 0.87 } }),
    phase(300, 'detected', `tomate ${tomatoId} mûre`),
    flow(400, 'server', 'agent', 'réveil'),
    at(400, { type: 'episode_start', episodeId: ep, tomatoId, sessionResumed: false }),
    say(700, `Une tomate mûre est signalée (id ${tomatoId}). Je regarde les trois vues avant de bouger.`),
    flow(900, 'agent', 'server', 'get_views'),
    call(900, 'c1', 'get_views', {}),
    ...(views ? [flow(1400, 'simulation', 'server', 'views'), at(1400, { type: 'views', episodeId: ep, result: views })] : []),
    done(1450, 'c1', true, 'trois vues rendues', 520),
    say(1700, "La verticale de chute tombe en X 12, Y −3 : je place le panier dessous, puis j'approche les ciseaux par pas de 5 cm."),
    flow(1900, 'agent', 'server', 'move_basket'),
    call(1900, 'c2', 'move_basket', { x: 12, y: -3, mode: 'absolute' }),
    done(2000, 'c2', true, 'panier en X 12, Y −3', 95),
    phase(2000, 'harvesting', 'premier mouvement'),
    call(2200, 'c3', 'move_scissors', { x: 8, y: -2, z: 41, mode: 'absolute' }),
    done(2400, 'c3', false, 'collision : trajet bloqué en X 9,5, Y −2, Z 44 (tomate 2)', 180),
    say(2600, 'Collision avec la tomate 2 : je passe par le dessus (Z 52) puis je redescends.'),
    call(2800, 'c4', 'move_scissors', { x: 8, y: -2, z: 52, mode: 'absolute' }),
    done(2950, 'c4', true, 'ciseaux en X 8, Y −2, Z 52', 140),
    call(3100, 'c5', 'rotate_scissors', { yaw: 35, mode: 'absolute' }),
    done(3200, 'c5', true, 'lacet 35°', 60),
    call(3300, 'c6', 'move_scissors', { x: 0, y: 0, z: -8, mode: 'relative' }),
    done(3450, 'c6', true, 'ciseaux en X 8, Y −2, Z 44', 130),
    call(3600, 'c7', 'open_scissors', {}),
    done(3650, 'c7', true, 'ouverture 60°', 40),
    call(3800, 'c8', 'cut', {}),
    phase(3900, 'cutting', 'cut'),
    done(4000, 'c8', true, 'stem_cut : distance 0,3 cm, angle 78°', 210),
    phase(4000, 'falling', 'tige coupée'),
    flow(4300, 'simulation', 'server', 'tomato_landed'),
    at(4300, { type: 'sim_event', event: { type: 'tomato_landed', tomatoId, inBasket: true } }),
    phase(4350, 'harvested', 'tomate dans le panier'),
    say(4500, 'La tomate est dans le panier. Je rapporte.'),
    call(4600, 'c9', 'report', { outcome: 'harvested', note: NOTE }),
    done(4700, 'c9', true, 'épisode clos', 30),
    flow(4800, 'server', 'dashboard', 'episode_end'),
    at(4800, { type: 'episode_end', episodeId: ep, outcome: 'harvested', note: NOTE, toolCalls: 9, costUsd: 0.0421, durationMs: 4400 }),
    phase(5800, 'idle', 'report'),
  ];
}
```

- [ ] **Step 4: Écrire `blockLayout.ts`**

```ts
import type { BlockId } from '@tomato/shared';

export interface BlockSpec {
  id: BlockId;
  label: string;
}

/** Les cinq blocs de la spec (section 6), dans l'ordre du flux. */
export const BLOCKS: readonly BlockSpec[] = [
  { id: 'simulation', label: 'Simulation' },
  { id: 'perception', label: 'Perception' },
  { id: 'server', label: 'Serveur MCP' },
  { id: 'agent', label: 'Agent' },
  { id: 'dashboard', label: 'Dashboard' },
];

export const DIAGRAM_W = 1000;
export const DIAGRAM_H = 92;
export const BLOCK_W = 150;
export const BLOCK_H = 36;
export const BLOCK_Y = 8;
/** Ordonnée du bus d'événements. */
export const BUS_Y = 76;
export const BLOCK_GAP = (DIAGRAM_W - BLOCKS.length * BLOCK_W) / (BLOCKS.length + 1);

export function blockIndex(id: BlockId): number {
  return BLOCKS.findIndex((b) => b.id === id);
}

/** Abscisse gauche d'un bloc dans le viewBox. */
export function blockX(id: BlockId): number {
  return BLOCK_GAP + blockIndex(id) * (BLOCK_W + BLOCK_GAP);
}

export function blockCenterX(id: BlockId): number {
  return blockX(id) + BLOCK_W / 2;
}

/** Segment du bus allumé entre deux blocs, ordonné de gauche à droite. */
export function busSegment(from: BlockId, to: BlockId): { x1: number; x2: number } {
  const a = blockCenterX(from);
  const b = blockCenterX(to);
  return { x1: Math.min(a, b), x2: Math.max(a, b) };
}
```

- [ ] **Step 5: Vérifier le succès**

Run: `npx vitest run packages/sim/src/dashboard/demoScript.test.ts packages/sim/src/dashboard/blockLayout.test.ts`
Expected: PASS, 6 tests.

- [ ] **Step 6: Commit**

```bash
git add packages/sim/src/dashboard/demoScript.ts packages/sim/src/dashboard/demoScript.test.ts packages/sim/src/dashboard/blockLayout.ts packages/sim/src/dashboard/blockLayout.test.ts
git commit -m "feat(dashboard): épisode scripté de démonstration et géométrie du schéma bloc"
```

---

### Task 6: Palette en tokens, classes partagées, hooks de flash et d'horloge

**Files:**
- Modify: `packages/sim/src/styles.css`
- Create: `packages/sim/src/dashboard/ui.ts`, `useFlash.ts`, `useWorldClock.ts`

**Interfaces:**
- Consumes: `SimRuntime` (`runtime.ctx.store.subscribe`, `get`).
- Produces:
  - Tokens Tailwind 4 `@theme` : `--color-ripe #c8261b`, `--color-turning #e08a1e`, `--color-unripe #3f9a3a`, `--color-stem #22d3ee`, `--color-scissors #e879f9`, `--color-basket #facc15`, `--color-axes #9ca3af`, `--color-ink #e6e8ea`, `--color-ink-dim #8a9097`, `--color-panel #0f1214`, `--color-panel-2 #171b1e`, `--color-line #272c31`, `--font-mono` ; classe `.views-flash` (animation 400 ms, désactivée en `prefers-reduced-motion`).
  - `const BTN: string`, `const SELECT: string` (classes des boutons et sélecteurs ; état actif via `aria-pressed:` en cyan).
  - `useFlash(atMs: number | null, durationMs: number): boolean`
  - `useWorldClock(runtime: SimRuntime | null): SimClock | null` (snapshot = chaîne `"12.3|5|0"`, donc un rendu par changement d'affichage, pas par frame).
- Direction visuelle (spec section 6 et contrat) : fond `panel` quasi noir légèrement froid, panneaux `panel-2`, traits `line` ; texte `ink`, secondaire `ink-dim` ; la seule couleur vive à un instant donné est celle qui porte une information (phase courante, erreur, bloc actif, pastille de connexion). Sans-serif système pour le texte, monospace pour tous les nombres. Aucun libellé en capitales, aucun séparateur décoratif : la structure est portée par les bordures fines et l'alignement.

- [ ] **Step 1: Écrire `styles.css`**

```css
@import 'tailwindcss';

/* Palette de la spec (section 6) : chaque couleur porte une information, jamais une décoration. */
@theme {
  --color-ripe: #c8261b;
  --color-turning: #e08a1e;
  --color-unripe: #3f9a3a;
  --color-stem: #22d3ee;
  --color-scissors: #e879f9;
  --color-basket: #facc15;
  --color-axes: #9ca3af;
  --color-ink: #e6e8ea;
  --color-ink-dim: #8a9097;
  --color-panel: #0f1214;
  --color-panel-2: #171b1e;
  --color-line: #272c31;
  --font-mono: ui-monospace, 'Cascadia Mono', 'JetBrains Mono', Consolas, monospace;
}

html, body, #root { height: 100%; margin: 0; }
body { background: var(--color-panel); color: var(--color-ink); }

/* Flash bref du cadre des vues à chaque message `views`. */
@keyframes views-flash {
  from { box-shadow: inset 0 0 0 3px var(--color-stem); }
  to { box-shadow: inset 0 0 0 0 transparent; }
}
.views-flash { animation: views-flash 400ms ease-out; }
@media (prefers-reduced-motion: reduce) {
  .views-flash { animation: none; box-shadow: inset 0 0 0 2px var(--color-stem); }
}
```

- [ ] **Step 2: Écrire `ui.ts`**

```ts
/** Classes partagées des contrôles : un seul style de bouton et de sélecteur, l'état actif en cyan. */
export const BTN =
  'rounded-sm border border-line bg-panel px-2.5 py-1 text-[12px] text-ink hover:border-axes focus-visible:outline focus-visible:outline-stem disabled:opacity-40 aria-pressed:border-stem aria-pressed:text-stem';

export const SELECT = 'rounded-sm border border-line bg-panel px-1.5 py-1 text-[12px] text-ink focus-visible:outline focus-visible:outline-stem';
```

- [ ] **Step 3: Écrire `useFlash.ts`**

```ts
import { useEffect, useState } from 'react';

/** Vrai pendant `durationMs` après chaque nouvelle valeur non nulle de `atMs` (flash des vues, blocs allumés). */
export function useFlash(atMs: number | null, durationMs: number): boolean {
  const [on, setOn] = useState(false);
  useEffect(() => {
    if (atMs === null) return;
    setOn(true);
    const timer = setTimeout(() => setOn(false), durationMs);
    return () => clearTimeout(timer);
  }, [atMs, durationMs]);
  return on;
}
```

- [ ] **Step 4: Écrire `useWorldClock.ts`**

```ts
import { useCallback, useSyncExternalStore } from 'react';
import type { SimRuntime } from '../core/runtime';
import type { SimClock } from './dashboardTypes';

const noop = (): void => {};

/**
 * Horloge de la sim locale. Le snapshot est une chaîne (comparée par valeur), donc le composant
 * ne se rend à nouveau que lorsque l'affichage change (dixième de seconde, facteur, pause), pas à chaque frame.
 */
export function useWorldClock(runtime: SimRuntime | null): SimClock | null {
  const subscribe = useCallback((onChange: () => void) => (runtime ? runtime.ctx.store.subscribe(onChange) : noop), [runtime]);
  const key = useSyncExternalStore(subscribe, () => {
    if (!runtime) return null;
    const s = runtime.ctx.store.get();
    return `${s.simTimeS.toFixed(1)}|${s.timeScale}|${s.paused ? 1 : 0}`;
  });
  if (key === null) return null;
  const [t, scale, paused] = key.split('|');
  return { simTimeS: Number(t), timeScale: Number(scale), paused: paused === '1' };
}
```

- [ ] **Step 5: Vérifier lint et typecheck**

Run: `npm run lint && npm run typecheck`
Expected: exit 0.

- [ ] **Step 6: Commit**

```bash
git add packages/sim/src/styles.css packages/sim/src/dashboard/ui.ts packages/sim/src/dashboard/useFlash.ts packages/sim/src/dashboard/useWorldClock.ts
git commit -m "feat(dashboard): palette de la spec en tokens Tailwind, classes partagées, hooks de flash et d'horloge sim"
```

---

### Task 7: `StatusBar` et `TracePanel` (composants testés sous jsdom)

**Files:**
- Create: `packages/sim/src/dashboard/StatusBar.tsx`, `StatusBar.test.tsx`, `TraceRow.tsx`, `TracePanel.tsx`, `TracePanel.test.tsx`

**Interfaces:**
- Consumes: `PHASES`, `Phase` de `@tomato/shared` ; `DashboardState`, `SimClock`, `TraceEntry` ; `PHASE_LABEL`, `formatCost`, `formatNum`, `formatClock`, `formatDuration`.
- Produces:
  - `StatusBar({ state: DashboardState; clock: SimClock | null; detector: string })` : `data-testid="status-bar"`, `connection`, pastilles `<ol aria-label="Phase">` avec `aria-current="step"` et `data-phase`, cellules `count-harvested`, `count-missed`, `sim-time`, `time-scale`, `detector`, `model`, `cost`.
  - `TraceRow({ entry: TraceEntry })` : `<li data-kind data-ok>` ; `TracePanel({ trace: TraceEntry[] })` : `<ol data-testid="trace">`, ligne d'attente si vide.
- Les fichiers de test portent en première ligne `// @vitest-environment jsdom` et appellent `cleanup` dans `afterEach` (pas de `globals`).

- [ ] **Step 1: Tests (échouent)**

`packages/sim/src/dashboard/StatusBar.test.tsx` :

```tsx
// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import { initialDashboardState } from './dashboardStore';
import { StatusBar } from './StatusBar';

afterEach(cleanup);

describe('StatusBar', () => {
  it('shows the eight phase pills with the current one marked, in French', () => {
    render(<StatusBar state={{ ...initialDashboardState(), phase: 'cutting' }} clock={null} detector="HSV/Sobel" />);
    const pills = within(screen.getByRole('list', { name: 'Phase' })).getAllByRole('listitem');
    expect(pills.map((li) => li.textContent)).toEqual(['repos', 'détectée', 'récolte', 'coupe', 'chute', 'récoltée', 'ratée', 'abandon']);
    const current = screen.getByText('coupe');
    expect(current.getAttribute('aria-current')).toBe('step');
    expect(screen.getByText('repos').getAttribute('aria-current')).toBeNull();
  });

  it('shows counters, model, cost, detector and the snapshot clock when no local clock is given', () => {
    const state = { ...initialDashboardState(), counters: { harvested: 2, missed: 1, aborted: 0 }, costUsd: 0.0421, sim: { simTimeS: 12.34, timeScale: 5, paused: false } };
    render(<StatusBar state={state} clock={null} detector="yolo/Canny" />);
    expect(screen.getByTestId('count-harvested').textContent).toBe('2');
    expect(screen.getByTestId('count-missed').textContent).toBe('1');
    expect(screen.getByTestId('cost').textContent).toBe('0,0421 $');
    expect(screen.getByTestId('model').textContent).toBe('claude-opus-5');
    expect(screen.getByTestId('detector').textContent).toBe('yolo/Canny');
    expect(screen.getByTestId('sim-time').textContent).toBe('12,3 s');
    expect(screen.getByTestId('time-scale').textContent).toBe('×5');
    expect(screen.getByTestId('connection').textContent).toContain('hors ligne');
  });

  it('prefers the local sim clock and says "pause" when paused', () => {
    render(<StatusBar state={initialDashboardState()} clock={{ simTimeS: 3, timeScale: 2, paused: true }} detector="HSV/Sobel" />);
    expect(screen.getByTestId('sim-time').textContent).toBe('3,0 s');
    expect(screen.getByTestId('time-scale').textContent).toBe('pause');
  });
});
```

`packages/sim/src/dashboard/TracePanel.test.tsx` :

```tsx
// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import type { TraceEntry } from './dashboardTypes';
import { TracePanel } from './TracePanel';

afterEach(cleanup);

const T0 = new Date(2026, 8, 17, 10, 0, 0).getTime();

const trace: TraceEntry[] = [
  { id: 3, kind: 'event', atMs: T0 + 2000, title: 'Tomate 3 dans le panier', ok: true },
  { id: 2, kind: 'tool', atMs: T0 + 1000, title: 'Ciseaux → X 8, Y −2, Z 41', ok: false, detail: 'collision : trajet bloqué', durationMs: 180 },
  { id: 1, kind: 'text', atMs: T0, title: 'Je regarde les vues.' },
];

describe('TracePanel', () => {
  it('renders the entries in the given order (newest first) with time, kind, title and duration', () => {
    render(<TracePanel trace={trace} />);
    const rows = within(screen.getByTestId('trace')).getAllByRole('listitem');
    expect(rows).toHaveLength(3);
    expect(rows[0]?.textContent).toContain('Tomate 3 dans le panier');
    expect(rows[2]?.textContent).toContain('Je regarde les vues.');
    expect(rows[1]?.textContent).toContain('10:00:01');
    expect(rows[1]?.textContent).toContain('180 ms');
    expect(rows[1]?.getAttribute('data-kind')).toBe('tool');
  });

  it('marks errors with data-ok="false" and shows their detail; other rows carry no data-ok', () => {
    render(<TracePanel trace={trace} />);
    const rows = within(screen.getByTestId('trace')).getAllByRole('listitem');
    expect(rows[1]?.getAttribute('data-ok')).toBe('false');
    expect(rows[1]?.textContent).toContain('collision : trajet bloqué');
    expect(rows[0]?.getAttribute('data-ok')).toBe('true');
    expect(rows[2]?.getAttribute('data-ok')).toBeNull();
  });

  it('shows a waiting line when the trace is empty', () => {
    render(<TracePanel trace={[]} />);
    expect(screen.getByTestId('trace').textContent).toContain("En attente d'un épisode.");
  });
});
```

- [ ] **Step 2: Vérifier l'échec**

Run: `npx vitest run packages/sim/src/dashboard/StatusBar.test.tsx packages/sim/src/dashboard/TracePanel.test.tsx`
Expected: FAIL, modules `./StatusBar` et `./TracePanel` introuvables (l'environnement jsdom se charge : sinon vérifier que `jsdom` est installé et que le pragma est en première ligne).

- [ ] **Step 3: Écrire `StatusBar.tsx`**

```tsx
import { PHASES, type Phase } from '@tomato/shared';
import type { Connection, DashboardState, SimClock } from './dashboardTypes';
import { PHASE_LABEL, formatCost, formatNum } from './traceFormat';

/** Pastille active : la couleur dit la phase (palette de la spec), rien d'autre n'est coloré. */
const PHASE_ACTIVE: Record<Phase, string> = {
  idle: 'bg-ink-dim text-panel',
  detected: 'bg-turning text-panel',
  harvesting: 'bg-stem text-panel',
  cutting: 'bg-scissors text-panel',
  falling: 'bg-basket text-panel',
  harvested: 'bg-unripe text-panel',
  missed: 'bg-ripe text-ink',
  aborted: 'bg-axes text-panel',
};

const CONNECTION_LABEL: Record<Connection, string> = { connected: 'serveur connecté', disconnected: 'hors ligne', replay: 'replay' };
const CONNECTION_DOT: Record<Connection, string> = { connected: 'bg-unripe', disconnected: 'bg-ripe', replay: 'bg-basket' };

function Cell({ label, value, testId }: { label: string; value: string; testId: string }) {
  return (
    <div className="flex items-baseline gap-1.5 border-l border-line pl-4">
      <span className="text-ink-dim">{label}</span>
      <span className="font-mono tabular-nums text-ink" data-testid={testId}>
        {value}
      </span>
    </div>
  );
}

interface Props {
  state: DashboardState;
  /** Horloge de la sim locale ; null en lecture seule (on affiche alors celle du dernier snapshot). */
  clock: SimClock | null;
  detector: string;
}

export function StatusBar({ state, clock, detector }: Props) {
  const sim = clock ?? state.sim;
  return (
    <header data-testid="status-bar" className="flex h-11 shrink-0 items-center gap-4 border-b border-line bg-panel-2 px-4 text-[13px]">
      <div className="flex items-center gap-2" data-testid="connection">
        <span aria-hidden="true" className={`inline-block h-2 w-2 rounded-full ${CONNECTION_DOT[state.connection]}`} />
        <span className="text-ink-dim">{CONNECTION_LABEL[state.connection]}</span>
      </div>
      <ol aria-label="Phase" className="flex items-center gap-1">
        {PHASES.map((p) => {
          const active = p === state.phase;
          return (
            <li key={p}>
              <span aria-current={active ? 'step' : undefined} data-phase={p} className={`rounded-sm px-2 py-0.5 ${active ? PHASE_ACTIVE[p] : 'text-ink-dim'}`}>
                {PHASE_LABEL[p]}
              </span>
            </li>
          );
        })}
      </ol>
      <Cell label="récoltées" value={String(state.counters.harvested)} testId="count-harvested" />
      <Cell label="ratées" value={String(state.counters.missed)} testId="count-missed" />
      <Cell label="t sim" value={`${formatNum(sim.simTimeS, 1)} s`} testId="sim-time" />
      <Cell label="facteur" value={sim.paused ? 'pause' : `×${formatNum(sim.timeScale)}`} testId="time-scale" />
      <div className="ml-auto flex items-baseline gap-4">
        <Cell label="détecteur" value={detector} testId="detector" />
        <Cell label="modèle" value={state.model ?? '—'} testId="model" />
        <Cell label="coût" value={formatCost(state.costUsd)} testId="cost" />
      </div>
    </header>
  );
}
```

- [ ] **Step 4: Écrire `TraceRow.tsx`**

```tsx
import type { TraceEntry, TraceKind } from './dashboardTypes';
import { formatClock, formatDuration } from './traceFormat';

const KIND_LABEL: Record<TraceKind, string> = { text: 'agent', tool: 'outil', event: 'événement', phase: 'phase' };

/** Bordure gauche = nature de la ligne ; fond teinté = erreur. */
function tone(entry: TraceEntry): string {
  if (entry.ok === false) return 'border-l-ripe bg-ripe/10';
  switch (entry.kind) {
    case 'phase':
      return 'border-l-stem';
    case 'tool':
      return 'border-l-scissors';
    case 'text':
      return 'border-l-ink-dim';
    case 'event':
      return 'border-l-line';
  }
}

function duration(entry: TraceEntry): string {
  if (entry.durationMs !== undefined) return formatDuration(entry.durationMs);
  return entry.kind === 'tool' && entry.ok === undefined ? '…' : '';
}

export function TraceRow({ entry }: { entry: TraceEntry }) {
  const error = entry.ok === false;
  return (
    <li
      data-kind={entry.kind}
      data-ok={entry.ok === undefined ? undefined : String(entry.ok)}
      className={`grid grid-cols-[auto_4.5rem_minmax(0,1fr)_auto] items-baseline gap-x-3 border-b border-l-2 border-line px-3 py-1.5 text-[13px] ${tone(entry)}`}
    >
      <time className="font-mono text-[11px] tabular-nums text-ink-dim">{formatClock(entry.atMs)}</time>
      <span className="text-[11px] text-ink-dim">{KIND_LABEL[entry.kind]}</span>
      <div className="min-w-0">
        <p className={`break-words ${error ? 'text-ripe' : 'text-ink'}`}>{entry.title}</p>
        {entry.detail !== undefined && entry.detail !== '' && (
          <p className={`whitespace-pre-line break-words text-[12px] ${error ? 'text-ripe/80' : 'text-ink-dim'}`}>{entry.detail}</p>
        )}
      </div>
      <span className="font-mono text-[11px] tabular-nums text-ink-dim">{duration(entry)}</span>
    </li>
  );
}
```

- [ ] **Step 5: Écrire `TracePanel.tsx`**

```tsx
import type { TraceEntry } from './dashboardTypes';
import { TraceRow } from './TraceRow';

/** Trace de l'agent, plus récent en haut (le store garantit l'ordre et le plafond). */
export function TracePanel({ trace }: { trace: TraceEntry[] }) {
  return (
    <section aria-label="Trace de l'agent" className="flex min-h-0 flex-col">
      <h2 className="shrink-0 border-b border-line px-3 py-1.5 text-[12px] text-ink-dim">Trace de l'agent, plus récent en haut</h2>
      <ol data-testid="trace" className="min-h-0 flex-1 overflow-y-auto">
        {trace.length === 0 && <li className="px-3 py-2 text-[12px] text-ink-dim">En attente d'un épisode.</li>}
        {trace.map((entry) => (
          <TraceRow key={entry.id} entry={entry} />
        ))}
      </ol>
    </section>
  );
}
```

- [ ] **Step 6: Vérifier le succès**

Run: `npx vitest run packages/sim/src/dashboard/StatusBar.test.tsx packages/sim/src/dashboard/TracePanel.test.tsx`
Expected: PASS, 6 tests.

- [ ] **Step 7: Commit**

```bash
git add packages/sim/src/dashboard/StatusBar.tsx packages/sim/src/dashboard/StatusBar.test.tsx packages/sim/src/dashboard/TraceRow.tsx packages/sim/src/dashboard/TracePanel.tsx packages/sim/src/dashboard/TracePanel.test.tsx
git commit -m "feat(dashboard): bandeau de statuts (phases, compteurs, horloge, modèle, coût) et trace plus récent en haut"
```

---

### Task 8: `BlockDiagram`, `Controls`, `ReplayPanel`, `ViewsPanel`

**Files:**
- Create: `packages/sim/src/dashboard/BlockDiagram.tsx`, `Controls.tsx`, `ReplayPanel.tsx`, `ViewsPanel.tsx`

**Interfaces:**
- Consumes: `blockLayout` (Task 5), `useFlash` (Task 6), `BTN`/`SELECT`, `SimRuntime`, `SimAction`, `BridgeSlot`, `createFakeBridge`, `episodesApi`, `AgentViews` de `../cameras/AgentViews` (M3).
- Produces:
  - `const BLOCK_FLASH_MS = 600`, `BlockDiagram({ flow: BlockFlow | null; atMs: number | null; open: boolean; onToggle: () => void })` : `data-testid="block-diagram"`, bouton `aria-expanded`, `data-testid="block-last-flow"`, SVG avec `data-testid="block-flow"` et `g[data-block][data-active]`.
  - `const SPEEDS = [1, 2, 5, 10] as const`, `Controls({ runtime; paused; timeScale; agentView; onToggleControls; onToggleAgentView; children? })` : `data-testid="controls"`, `role="toolbar"`.
  - `ReplayPanel({ slot: BridgeSlot })` : `role="group" aria-label="Replay"`, sélecteurs « Épisode à rejouer » et « Vitesse de replay », boutons Épisodes / Rejouer / Arrêter.
  - `const VIEWS_FLASH_MS = 400`, `ViewsPanel({ views; lastViewsAt; enlarged; onEnlarge })` : `data-testid="views"`, `data-flash`, images `alt="vue <id>"`, boutons « Agrandir la vue <id> », dialogue `aria-modal` fermé par Échap ; repli `<AgentViews />` tant qu'aucune vue n'est venue d'un pont.
- Pas de test Node pour ces composants : ils n'ont pas de logique propre (tout est dans le store et les modules purs) ; ils sont exercés par Playwright (Task 10) et par le visual-checker.

- [ ] **Step 1: Écrire `BlockDiagram.tsx`**

```tsx
import type { BlockId } from '@tomato/shared';
import { BLOCKS, BLOCK_H, BLOCK_W, BLOCK_Y, BUS_Y, DIAGRAM_H, DIAGRAM_W, blockCenterX, blockX, busSegment } from './blockLayout';
import type { BlockFlow } from './dashboardTypes';
import { useFlash } from './useFlash';

/** Durée d'allumage d'un bloc et de sa flèche après `block_activity` (contrat Étape 3). */
export const BLOCK_FLASH_MS = 600;

interface Props {
  flow: BlockFlow | null;
  atMs: number | null;
  open: boolean;
  onToggle: () => void;
}

/** Bandeau bas repliable : Simulation → Perception → Serveur MCP → Agent → Dashboard sur un bus d'événements. */
export function BlockDiagram({ flow, atMs, open, onToggle }: Props) {
  const lit = useFlash(atMs, BLOCK_FLASH_MS);
  const active: BlockId | null = lit && flow ? flow.to : null;
  const seg = lit && flow ? busSegment(flow.from, flow.to) : null;
  const toX = flow ? blockCenterX(flow.to) : 0;
  return (
    <footer data-testid="block-diagram" className="shrink-0 border-t border-line bg-panel-2">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        aria-controls="block-diagram-svg"
        className="flex h-7 w-full items-center gap-2 px-4 text-[12px] text-ink-dim hover:text-ink"
      >
        <span aria-hidden="true">{open ? '▾' : '▸'}</span>
        Schéma bloc (b)
        {flow && (
          <span className="ml-auto font-mono text-[11px]" data-testid="block-last-flow">
            {flow.from} → {flow.to} : {flow.label}
          </span>
        )}
      </button>
      {open && (
        <svg
          id="block-diagram-svg"
          viewBox={`0 0 ${DIAGRAM_W} ${DIAGRAM_H}`}
          role="img"
          aria-label="Simulation, Perception, Serveur MCP, Agent et Dashboard reliés par le bus d'événements"
          className="block h-[92px] w-full"
        >
          <line x1={blockCenterX('simulation')} x2={blockCenterX('dashboard')} y1={BUS_Y} y2={BUS_Y} stroke="var(--color-line)" strokeWidth={2} />
          {seg && flow && (
            <g data-testid="block-flow">
              <line x1={seg.x1} x2={seg.x2} y1={BUS_Y} y2={BUS_Y} stroke="var(--color-stem)" strokeWidth={3} />
              <text x={(seg.x1 + seg.x2) / 2} y={BUS_Y - 6} textAnchor="middle" fill="var(--color-stem)" fontSize={11} fontFamily="var(--font-mono)">
                {flow.label}
              </text>
              <polygon points={`${toX - 6},${BLOCK_Y + BLOCK_H + 12} ${toX + 6},${BLOCK_Y + BLOCK_H + 12} ${toX},${BLOCK_Y + BLOCK_H + 2}`} fill="var(--color-stem)" />
            </g>
          )}
          {BLOCKS.map((b) => {
            const on = b.id === active;
            const cx = blockCenterX(b.id);
            return (
              <g key={b.id} data-block={b.id} data-active={on ? 'true' : undefined}>
                <line x1={cx} x2={cx} y1={BLOCK_Y + BLOCK_H} y2={BUS_Y} stroke={on ? 'var(--color-stem)' : 'var(--color-line)'} strokeWidth={on ? 2 : 1} />
                <rect
                  x={blockX(b.id)}
                  y={BLOCK_Y}
                  width={BLOCK_W}
                  height={BLOCK_H}
                  rx={3}
                  fill={on ? 'var(--color-stem)' : 'var(--color-panel)'}
                  stroke={on ? 'var(--color-stem)' : 'var(--color-axes)'}
                />
                <text x={cx} y={BLOCK_Y + BLOCK_H / 2 + 4} textAnchor="middle" fontSize={13} fill={on ? 'var(--color-panel)' : 'var(--color-ink)'}>
                  {b.label}
                </text>
              </g>
            );
          })}
        </svg>
      )}
    </footer>
  );
}
```

- [ ] **Step 2: Écrire `Controls.tsx`**

```tsx
import type { ReactNode } from 'react';
import type { SimAction } from '@tomato/shared';
import type { SimRuntime } from '../core/runtime';
import { BTN } from './ui';

/** Facteurs de vitesse proposés (spec section 6 : pause, vitesse). */
export const SPEEDS = [1, 2, 5, 10] as const;

interface Props {
  /** null tant que la sim n'est pas prête : les actions locales sont alors désactivées. */
  runtime: SimRuntime | null;
  paused: boolean;
  timeScale: number;
  agentView: boolean;
  onToggleControls: () => void;
  onToggleAgentView: () => void;
  /** Le panneau de replay, rendu dans la même barre. */
  children?: ReactNode;
}

/** Contrôles de tournage : agissent sur la sim locale via `runtime.apply` (aucun passage par le serveur). */
export function Controls({ runtime, paused, timeScale, agentView, onToggleControls, onToggleAgentView, children }: Props) {
  const off = runtime === null;
  const apply = (action: SimAction): void => {
    runtime?.apply(action);
  };
  return (
    <div data-testid="controls" role="toolbar" aria-label="Contrôles de tournage" className="flex flex-wrap items-center gap-2 rounded-sm border border-line bg-panel-2/90 p-2">
      <button type="button" className={BTN} disabled={off} aria-pressed={paused} onClick={() => apply({ type: 'set_paused', paused: !paused })}>
        {paused ? 'Reprendre' : 'Pause'}
      </button>
      <div role="group" aria-label="Vitesse" className="flex items-center gap-1">
        {SPEEDS.map((s) => (
          <button key={s} type="button" className={`${BTN} font-mono`} disabled={off} aria-pressed={timeScale === s} onClick={() => apply({ type: 'set_time_scale', scale: s })}>
            ×{s}
          </button>
        ))}
      </div>
      <button type="button" className={BTN} disabled={off} onClick={() => apply({ type: 'ripen_next' })}>
        Mûrir la prochaine tomate
      </button>
      <button type="button" className={BTN} disabled={off} onClick={() => apply({ type: 'new_plant' })}>
        Nouveau plant
      </button>
      {children}
      <button type="button" className={BTN} aria-pressed={agentView} onClick={onToggleAgentView}>
        Ce que voit l'agent (v)
      </button>
      <button type="button" className={BTN} onClick={onToggleControls}>
        Masquer les contrôles (h)
      </button>
    </div>
  );
}
```

- [ ] **Step 3: Écrire `ReplayPanel.tsx`**

```tsx
import { useCallback, useState } from 'react';
import { createFakeBridge } from '../bridge/fakeBridge';
import type { BridgeSlot } from './bridgeSlot';
import { SPEEDS } from './Controls';
import { listEpisodes, loadEpisode, scriptDurationMs, toScript, type EpisodeSummary } from './episodesApi';
import { formatDuration } from './traceFormat';
import { BTN, SELECT } from './ui';

type Status = { kind: 'idle' } | { kind: 'loading' } | { kind: 'playing'; durationMs: number } | { kind: 'error'; message: string };

function statusText(status: Status, count: number): string {
  switch (status.kind) {
    case 'idle':
      return count === 0 ? 'aucun épisode chargé' : `${count} épisode(s)`;
    case 'loading':
      return 'chargement…';
    case 'playing':
      return `lecture, ${formatDuration(status.durationMs)}`;
    case 'error':
      return `serveur injoignable (${status.message})`;
  }
}

function optionLabel(e: EpisodeSummary): string {
  const when = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(e.startedAt) ? e.startedAt.slice(11, 19) : e.startedAt;
  return `${when} ${e.outcome} (tomate ${e.tomatoId})`;
}

/** Replay : liste `GET /episodes`, lecture d'un épisode par un pont simulé à la vitesse choisie. */
export function ReplayPanel({ slot }: { slot: BridgeSlot }) {
  const [episodes, setEpisodes] = useState<EpisodeSummary[]>([]);
  const [selected, setSelected] = useState('');
  const [speed, setSpeed] = useState<number>(1);
  const [status, setStatus] = useState<Status>({ kind: 'idle' });

  const fail = (e: unknown): void => setStatus({ kind: 'error', message: e instanceof Error ? e.message : String(e) });

  const refresh = useCallback(async () => {
    setStatus({ kind: 'loading' });
    try {
      const list = await listEpisodes();
      setEpisodes(list);
      setSelected((current) => current || (list[0]?.episodeId ?? ''));
      setStatus({ kind: 'idle' });
    } catch (e) {
      fail(e);
    }
  }, []);

  const play = useCallback(async () => {
    if (selected === '') return;
    setStatus({ kind: 'loading' });
    try {
      const script = toScript(await loadEpisode(selected), speed);
      slot.play(createFakeBridge(script));
      setStatus({ kind: 'playing', durationMs: scriptDurationMs(script) });
    } catch (e) {
      fail(e);
    }
  }, [selected, speed, slot]);

  const stop = useCallback(() => {
    slot.stop();
    setStatus({ kind: 'idle' });
  }, [slot]);

  return (
    <div role="group" aria-label="Replay" className="flex items-center gap-1.5 border-l border-line pl-2">
      <button type="button" className={BTN} onClick={() => void refresh()} disabled={status.kind === 'loading'}>
        Épisodes
      </button>
      <select aria-label="Épisode à rejouer" className={SELECT} value={selected} onChange={(e) => setSelected(e.target.value)} disabled={episodes.length === 0}>
        {episodes.length === 0 && <option value="">aucun</option>}
        {episodes.map((e) => (
          <option key={e.episodeId} value={e.episodeId}>
            {optionLabel(e)}
          </option>
        ))}
      </select>
      <select aria-label="Vitesse de replay" className={`${SELECT} font-mono`} value={speed} onChange={(e) => setSpeed(Number(e.target.value))}>
        {SPEEDS.map((s) => (
          <option key={s} value={s}>
            ×{s}
          </option>
        ))}
      </select>
      <button type="button" className={BTN} onClick={() => void play()} disabled={selected === '' || status.kind === 'loading'}>
        Rejouer
      </button>
      <button type="button" className={BTN} onClick={stop} disabled={status.kind !== 'playing'}>
        Arrêter
      </button>
      <span className="text-[12px] text-ink-dim" aria-live="polite">
        {statusText(status, episodes.length)}
      </span>
    </div>
  );
}
```

- [ ] **Step 4: Écrire `ViewsPanel.tsx`**

```tsx
import { useEffect } from 'react';
import { CAMERA_IDS, type CameraId, type ViewImage } from '@tomato/shared';
import { AgentViews } from '../cameras/AgentViews';
import { BTN } from './ui';
import { useFlash } from './useFlash';

/** Durée du flash du cadre à chaque message `views`. */
export const VIEWS_FLASH_MS = 400;

const CAMERA_AXES: Record<CameraId, string> = { top: 'X → droite, Y → haut', front: 'X → droite, Z → haut', side: 'Y → droite, Z → haut' };

interface Props {
  views: Record<CameraId, ViewImage | null>;
  lastViewsAt: number | null;
  enlarged: CameraId | null;
  onEnlarge: (camera: CameraId | null) => void;
}

/**
 * « Ce que voit l'agent ». Tant qu'aucun message `views` n'est arrivé (page seule, sans serveur ni replay),
 * le composant `AgentViews` de M3 est affiché tel quel (rendu local + bouton « Rafraîchir les vues »).
 * Dès qu'un pont fournit des vues, elles sont affichées telles que reçues par l'agent, clic pour agrandir.
 */
export function ViewsPanel({ views, lastViewsAt, enlarged, onEnlarge }: Props) {
  const flash = useFlash(lastViewsAt, VIEWS_FLASH_MS);
  const fromBridge = CAMERA_IDS.some((id) => views[id] !== null);

  useEffect(() => {
    if (enlarged === null) return;
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onEnlarge(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [enlarged, onEnlarge]);

  const big = enlarged === null ? null : views[enlarged];

  return (
    <section data-testid="views" data-flash={flash ? 'true' : undefined} aria-label="Ce que voit l'agent" className={`shrink-0 border-b border-line p-3 ${flash ? 'views-flash' : ''}`}>
      {fromBridge ? (
        <div className="grid grid-cols-3 gap-2">
          {CAMERA_IDS.map((id) => {
            const img = views[id];
            return (
              <figure key={id} className="flex flex-col gap-1">
                {img ? (
                  <button type="button" aria-label={`Agrandir la vue ${id}`} onClick={() => onEnlarge(id)} className="block w-full focus-visible:outline focus-visible:outline-stem">
                    <img alt={`vue ${id}`} src={`data:image/png;base64,${img.pngBase64}`} className="aspect-square w-full bg-black" />
                  </button>
                ) : (
                  <div className="aspect-square w-full bg-panel-2" />
                )}
                <figcaption className="text-[11px] text-ink-dim">
                  <span className="text-ink">{id}</span> {CAMERA_AXES[id]}
                </figcaption>
              </figure>
            );
          })}
        </div>
      ) : (
        <AgentViews />
      )}
      {big && enlarged && (
        <div role="dialog" aria-modal="true" aria-label={`Vue ${enlarged} agrandie`} className="fixed inset-0 z-50 flex items-center justify-center bg-black/85" onClick={() => onEnlarge(null)}>
          <img alt={`vue ${enlarged} agrandie`} src={`data:image/png;base64,${big.pngBase64}`} className="max-h-[96vh] max-w-[96vw]" />
          <button type="button" className={`${BTN} absolute right-4 top-4`} onClick={() => onEnlarge(null)}>
            Fermer (Échap)
          </button>
        </div>
      )}
    </section>
  );
}
```

- [ ] **Step 5: Vérifier lint et typecheck**

Run: `npm run lint && npm run typecheck`
Expected: exit 0.

- [ ] **Step 6: Commit**

```bash
git add packages/sim/src/dashboard/BlockDiagram.tsx packages/sim/src/dashboard/Controls.tsx packages/sim/src/dashboard/ReplayPanel.tsx packages/sim/src/dashboard/ViewsPanel.tsx
git commit -m "feat(dashboard): schéma bloc animé, contrôles de tournage, replay d'épisode, panneau des vues avec flash"
```

---

### Task 9: `Dashboard.tsx` et réécriture de `App.tsx`

**Files:**
- Create: `packages/sim/src/dashboard/Dashboard.tsx`
- Modify: `packages/sim/src/App.tsx`

**Interfaces:**
- Produces:
  - `Dashboard({ store: DashboardStore; slot: BridgeSlot; runtime: SimRuntime | null; onSceneReady: (scene: SceneHandle) => void | (() => void) })` : `<main data-testid="dashboard" data-layout="normal" | "agent">`, grille `55fr 45fr` (ou `30fr 70fr`), touches `h`, `v`, `b` ignorées dans les champs de saisie.
  - `App()` : `window.__tomato = { runtime, renderViews?, fakeBridge?, attachBridge?, stopReplay?, demoScript? }` (les quatre derniers en `import.meta.env.DEV` seulement), `slot.setLive(await loadLiveBridge(...))`, `fetchServerModel()` → `local_model`.

- [ ] **Step 1: Écrire `Dashboard.tsx`**

```tsx
import { useCallback, useEffect, useState, useSyncExternalStore } from 'react';
import type { CameraId } from '@tomato/shared';
import type { SimRuntime } from '../core/runtime';
import type { SceneHandle } from '../three/createScene';
import { SpectatorView } from '../three/SpectatorView';
import { BlockDiagram } from './BlockDiagram';
import type { BridgeSlot } from './bridgeSlot';
import { Controls } from './Controls';
import type { DashboardStore } from './dashboardStore';
import { detectorLabel, loadPerceptionState, type PerceptionReader } from './perceptionInfo';
import { ReplayPanel } from './ReplayPanel';
import { StatusBar } from './StatusBar';
import { TracePanel } from './TracePanel';
import { useWorldClock } from './useWorldClock';
import { ViewsPanel } from './ViewsPanel';

/** Période de relecture de `perceptionState()` (M4) pour le bandeau. */
const DETECTOR_POLL_MS = 500;

function isEditable(target: EventTarget | null): boolean {
  return target instanceof HTMLElement && (target.tagName === 'INPUT' || target.tagName === 'SELECT' || target.tagName === 'TEXTAREA' || target.isContentEditable);
}

function useDetectorLabel(): string {
  const [label, setLabel] = useState(detectorLabel(null));
  useEffect(() => {
    let read: PerceptionReader | null = null;
    let cancelled = false;
    void loadPerceptionState().then((fn) => {
      if (!cancelled) read = fn;
    });
    const timer = setInterval(() => setLabel(detectorLabel(read ? read() : null)), DETECTOR_POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, []);
  return label;
}

interface Props {
  store: DashboardStore;
  slot: BridgeSlot;
  runtime: SimRuntime | null;
  onSceneReady: (scene: SceneHandle) => void | (() => void);
}

/**
 * Mise en page de la spec (section 6) : bandeau haut, gauche 55 % vue spectateur (30 % en mode « ce que voit l'agent »),
 * droite vues puis trace, bandeau bas repliable. Touches : h contrôles, v mode agent, b schéma.
 */
export function Dashboard({ store, slot, runtime, onSceneReady }: Props) {
  const state = useSyncExternalStore(store.subscribe, store.get);
  const clock = useWorldClock(runtime);
  const detector = useDetectorLabel();

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (isEditable(e.target) || e.altKey || e.ctrlKey || e.metaKey) return;
      if (e.key === 'h') store.dispatch({ type: 'local_toggle_controls' });
      else if (e.key === 'v') store.dispatch({ type: 'local_toggle_agent_view' });
      else if (e.key === 'b') store.dispatch({ type: 'local_toggle_diagram' });
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [store]);

  const enlarge = useCallback((camera: CameraId | null) => store.dispatch({ type: 'local_enlarge', camera }), [store]);
  const { ui } = state;
  const sim = clock ?? state.sim;

  return (
    <main data-testid="dashboard" data-layout={ui.agentView ? 'agent' : 'normal'} className="grid h-full w-full grid-rows-[auto_minmax(0,1fr)_auto] bg-panel text-ink">
      <StatusBar state={state} clock={clock} detector={detector} />
      <div className={`grid min-h-0 ${ui.agentView ? 'grid-cols-[30fr_70fr]' : 'grid-cols-[55fr_45fr]'}`}>
        <section aria-label="Vue spectateur" className="relative min-h-0">
          <SpectatorView onReady={onSceneReady} />
          <div className="absolute left-3 top-3 text-[12px] text-ink-dim">Vue spectateur</div>
          {!ui.controlsHidden && (
            <div className="absolute bottom-3 left-3 right-3">
              <Controls
                runtime={runtime}
                paused={sim.paused}
                timeScale={sim.timeScale}
                agentView={ui.agentView}
                onToggleControls={() => store.dispatch({ type: 'local_toggle_controls' })}
                onToggleAgentView={() => store.dispatch({ type: 'local_toggle_agent_view' })}
              >
                <ReplayPanel slot={slot} />
              </Controls>
            </div>
          )}
        </section>
        <aside className="grid min-h-0 grid-rows-[auto_minmax(0,1fr)] border-l border-line">
          <ViewsPanel views={state.views} lastViewsAt={state.lastViewsAt} enlarged={ui.enlarged} onEnlarge={enlarge} />
          <TracePanel trace={state.trace} />
        </aside>
      </div>
      <BlockDiagram flow={state.blocks.flow} atMs={state.blocks.atMs} open={ui.diagramOpen} onToggle={() => store.dispatch({ type: 'local_toggle_diagram' })} />
    </main>
  );
}
```

- [ ] **Step 2: Réécrire `App.tsx`**

Contenu attendu quand M1, M2 et M3 sont mergés (condition de passage de l'Étape 2) et ni M4 ni M5 :

```tsx
import { useCallback, useMemo, useState } from 'react';
import { createDefaultWorld } from '@tomato/shared';
import { createFakeBridge } from './bridge/fakeBridge';
import { cameraModule, getRenderViews, type RenderViewsFn } from './cameras/cameraModule';
import type { SimModule } from './core/module';
import { createRuntime, type SimRuntime } from './core/runtime';
import { WS_URL, loadLiveBridge } from './dashboard/bridgeLoader';
import { createBridgeSlot } from './dashboard/bridgeSlot';
import type { DashboardBridge } from './dashboard/bridgeTypes';
import { Dashboard } from './dashboard/Dashboard';
import { createDashboardStore } from './dashboard/dashboardStore';
import { buildDemoScript } from './dashboard/demoScript';
import { fetchServerModel } from './dashboard/episodesApi';
import { plantModule } from './plant/plantModule';
import { robotModule } from './robot/robotModule';
import type { SceneHandle } from './three/createScene';

const SEED = 20260917;

/** Modules de la sim, dans l'ordre de dispatch des actions : M1 (plant), M2 (robot), M3 (cameras), puis M4 (perception) quand il est mergé. */
const MODULES: SimModule[] = [plantModule, robotModule, cameraModule];

declare global {
  interface Window {
    __tomato?: {
      runtime: SimRuntime;
      renderViews?: RenderViewsFn;
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
      let cancelled = false;
      let stopFrames: (() => void) | null = null;
      let live: DashboardBridge | null = null;
      void createRuntime(createDefaultWorld(SEED), scene, MODULES).then(async (rt) => {
        if (cancelled) return;
        const renderViews = getRenderViews();
        const dev = import.meta.env.DEV ? { fakeBridge: createFakeBridge, attachBridge: slot.play, stopReplay: slot.stop, demoScript: buildDemoScript } : {};
        window.__tomato = { runtime: rt, ...(renderViews ? { renderViews } : {}), ...dev };
        stopFrames = scene.onFrame((dt) => rt.step(dt));
        setRuntime(rt);
        void fetchServerModel().then((model) => {
          if (model !== null && !cancelled) store.dispatch({ type: 'local_model', model });
        });
        // Pont WebSocket de M5 s'il est mergé (sinon null : page autonome, replay et pont simulé restent possibles).
        live = await loadLiveBridge({ url: WS_URL, runtime: rt, renderViews: renderViews ?? (() => Promise.reject(new Error('renderViews indisponible'))) });
        if (cancelled) {
          live?.close();
          return;
        }
        slot.setLive(live);
      });
      return () => {
        cancelled = true;
        stopFrames?.();
        live?.close();
        slot.setLive(null);
      };
    },
    [slot, store],
  );

  return <Dashboard store={store} slot={slot} runtime={runtime} onSceneReady={onSceneReady} />;
}
```

Règles de fusion : (a) la ligne `MODULES` reprend exactement la liste trouvée dans le `App.tsx` courant (si M4 est mergé, elle contient aussi `perceptionModule` après `cameraModule` : le garder, avec son import) ; (b) si M5 est mergé et que `App.tsx` contient déjà un appel `createBridge({ url, runtime, renderViews })`, remplacer la ligne `live = await loadLiveBridge({ … })` par `live = createBridge({ url: WS_URL, runtime: rt, renderViews: renderViews ?? (() => Promise.reject(new Error('renderViews indisponible'))) })` avec `import { createBridge } from './bridge/createBridge'`, puis supprimer `dashboard/bridgeLoader.ts` et son test (garder `WS_URL` dans `App.tsx`) ; (c) si M5 a créé `bridge/fakeBridge.ts`, l'import `createFakeBridge` reste identique ; (d) le plant statique de l'Étape 1 (`scene.addObject(buildPlantMesh(…))`) ne revient pas : M1 l'a remplacé par `plantModule`. Rien d'autre ne change.

- [ ] **Step 3: Vérifier dans le navigateur**

Run: `npm run dev:sim` puis ouvrir http://localhost:5173.
Expected: bandeau haut avec « hors ligne », les huit pastilles de phase (« repos » remplie en gris), compteurs à 0, « t sim » qui avance en monospace, « facteur ×1 », « détecteur HSV/Sobel », « modèle claude-opus-5 », « coût 0,0000 $ » ; à gauche la scène 3D avec, en bas, la barre de contrôles ; à droite le panneau `AgentViews` de M3 (bouton « Rafraîchir les vues ») puis « En attente d'un épisode. » ; en bas le schéma bloc à cinq blocs. Cliquer « Pause » : le temps sim s'arrête et le facteur affiche « pause » ; « ×5 » : le temps accélère ; « Mûrir la prochaine tomate » : une tomate passe au rouge ; touche `h` : la barre disparaît, `h` : elle revient ; touche `v` : la colonne droite passe à 70 % et les vues grossissent, `v` : retour ; touche `b` : le schéma se replie sur son en-tête. Dans la console : `t = window.__tomato; t.attachBridge(t.fakeBridge(t.demoScript(await t.renderViews(['top','front','side']), t.runtime.ctx.store.get())))` → en six secondes la trace se remplit (plus récent en haut, l'appel « Ciseaux → X 8, Y −2, Z 41 » en rouge), les trois vues apparaissent avec un flash cyan, la pastille passe par détectée → récolte → coupe → chute → récoltée → repos, le compteur « récoltées » passe à 1, le coût à 0,0421 $, le bloc Dashboard s'allume en cyan 600 ms à la fin ; `t.stopReplay()` remet « hors ligne ». Aucune erreur console.

- [ ] **Step 4: Lint, typecheck, build**

Run: `npm run lint && npm run typecheck && npm run build`
Expected: exit 0.

- [ ] **Step 5: Commit**

```bash
git add packages/sim/src/dashboard/Dashboard.tsx packages/sim/src/App.tsx
git commit -m "feat(dashboard): mise en page 55/45, mode « ce que voit l'agent », raccourcis clavier, App monte le dashboard avec runtime et pont"
```

---

### Task 10: Test Playwright du dashboard (`dashboard.spec.ts`)

**Files:**
- Create: `packages/sim/tests/dashboard.spec.ts`

**Interfaces:**
- Produces: `npm run shot` écrit `data/shots/dashboard.png` (mise en page normale, contrôles visibles, épisode scripté rejoué) et `data/shots/dashboard-agentview.png` (après `v` puis `h` : vues agrandies, contrôles masqués, cadre de tournage), utilisés par le visual-checker.

- [ ] **Step 1: Écrire le test**

`packages/sim/tests/dashboard.spec.ts` :

```ts
import { expect, test } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';

const shotsDir = resolve(import.meta.dirname, '../../../data/shots');

test('dashboard replays a scripted episode and is captured at 1920×1080 in both layouts', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/');
  await expect(page.getByTestId('spectator')).toBeVisible();
  await page.waitForFunction(() => window.__tomato?.attachBridge !== undefined, undefined, { timeout: 30_000 });

  // Épisode scripté injecté par le pont simulé, avec de vraies vues rendues par M3 si disponibles.
  const hasViews = await page.evaluate(async () => {
    const t = window.__tomato!;
    const views = t.renderViews ? await t.renderViews(['top', 'front', 'side']) : null;
    t.attachBridge!(t.fakeBridge!(t.demoScript!(views, t.runtime.ctx.store.get())));
    return views !== null;
  });

  const trace = page.getByTestId('trace');
  await expect(trace).toContainText('Épisode terminé : récoltée', { timeout: 20_000 });
  await expect(trace.locator('li').first()).toContainText('Épisode terminé'); // plus récent en haut
  await expect(trace.locator('li[data-ok="false"]').first()).toContainText('Ciseaux → X 8, Y −2, Z 41'); // erreur surlignée
  await expect(page.getByTestId('count-harvested')).toHaveText('1');
  await expect(page.getByTestId('cost')).toHaveText('0,0421 $');
  await expect(page.getByTestId('connection')).toContainText('replay');
  await expect(page.getByTestId('block-last-flow')).toContainText('server → dashboard');
  if (hasViews) await expect(page.locator('img[alt="vue front"]')).toBeVisible();

  mkdirSync(shotsDir, { recursive: true });
  await page.screenshot({ path: resolve(shotsDir, 'dashboard.png') });

  // Cadre de tournage : vues agrandies (v) et contrôles masqués (h).
  await page.keyboard.press('v');
  await expect(page.getByTestId('dashboard')).toHaveAttribute('data-layout', 'agent');
  await page.keyboard.press('h');
  await expect(page.getByTestId('controls')).toHaveCount(0);
  await page.waitForTimeout(500);
  await page.screenshot({ path: resolve(shotsDir, 'dashboard-agentview.png') });

  await page.keyboard.press('h');
  await expect(page.getByTestId('controls')).toBeVisible();
  await page.keyboard.press('v');
  await expect(page.getByTestId('dashboard')).toHaveAttribute('data-layout', 'normal');

  expect(errors).toEqual([]);
});
```

- [ ] **Step 2: Lancer**

Run: `npm run shot`
Expected: tous les tests Playwright passent (`scene.spec.ts`, `views.spec.ts`, `robot.spec.ts`, `dashboard.spec.ts`) ; `data/shots/` contient `dashboard.png` et `dashboard-agentview.png` en plus des captures précédentes. Ouvrir les deux PNG (outil Read) et vérifier à l'œil : disposition 55/45 puis 30/70, trois vues à droite, trace lisible avec la ligne en rouge, pastille « récoltée » ou « repos », compteur 1, coût 0,0421 $, schéma bloc en bas, contrôles présents dans la première capture et absents de la seconde. Si un autre serveur de dev tourne déjà sur le port 5173 (autre worktree), l'arrêter d'abord : `reuseExistingServer: true` ferait tester une autre page.

- [ ] **Step 3: Commit**

```bash
git add packages/sim/tests/dashboard.spec.ts
git commit -m "test(dashboard): capture Playwright du dashboard rejouant un épisode scripté, mode normal et mode agent"
```

---

### Task 11: Gates, captures, checklist et PR

**Files:**
- Modify: `docs/superpowers/specs/2026-09-17-etape-3-m7-dashboard-checklist.md` (cocher)
- Create: `data/build_verdict.json`

- [ ] **Step 1: Gates complets**

Run:
```bash
npm run lint && npm run typecheck && npm test && npm run build && npm run shot
```
Expected: les cinq commandes sortent en 0 ; Vitest rapporte les 49 tests M7 (traceFormat 8, dashboardStore 13, fakeBridge 3, bridgeSlot 4, bridgeLoader 3, perceptionInfo 2, episodesApi 4, demoScript 3, blockLayout 3, StatusBar 3, TracePanel 3) en plus des tests existants ; `data/shots/` contient `dashboard.png`, `dashboard-agentview.png` et les captures des modules précédents.

- [ ] **Step 2: Vérifier le périmètre des fichiers**

Run: `git diff --name-only main...HEAD`
Expected: uniquement des fichiers sous `packages/sim/src/dashboard/`, `packages/sim/src/App.tsx`, `packages/sim/src/styles.css`, `packages/sim/package.json`, `package-lock.json`, `packages/sim/vitest.config.ts`, `packages/sim/tests/dashboard.spec.ts`, `packages/sim/src/bridge/fakeBridge.ts` et `fakeBridge.test.ts` (seulement s'ils ont été créés ici), et la checklist. Aucun fichier sous `packages/shared/`. `wc -l packages/sim/src/dashboard/*` : chaque fichier fait moins de 200 lignes.

- [ ] **Step 3: Cocher la checklist**

Cocher chaque `[SPEC-N]`, `[TEST-N]`, `[GATE-N]` de `docs/superpowers/specs/2026-09-17-etape-3-m7-dashboard-checklist.md` avec la sortie fraîche sous les yeux. Un item non réalisable → ne pas cocher, rendre `failed` avec `items_skipped`.

```bash
git add docs/superpowers/specs/2026-09-17-etape-3-m7-dashboard-checklist.md
git commit -m "docs(dashboard): checklist M7 cochée"
```

- [ ] **Step 4: PR**

```bash
git push -u origin feat/7-m7-dashboard
gh pr create --base main --title "feat(dashboard): panneaux, trace, statuts, schéma bloc animé, contrôles de tournage, replay (M7)" --body "Closes #7

Checklist: docs/superpowers/specs/2026-09-17-etape-3-m7-dashboard-checklist.md
Plan: docs/superpowers/plans/2026-09-17-etape-3-m7-dashboard.md

## Gates
lint: pass · typecheck: pass · test: pass · build: pass · shot: pass (data/shots/dashboard.png, dashboard-agentview.png)

🤖 Generated with [Claude Code](https://claude.com/claude-code)"
gh issue edit 7 --remove-label todo --remove-label in-progress --add-label in-review
```

Puis écrire `data/build_verdict.json` selon `.claude/agents/builder.md` (`status: "pr_created"`, numéro de PR, branche, `items_skipped: []`, `plan_deviations` réelles, gates).

---

## Auto-revue du plan

**Couverture de la spec section 6, élément par élément :**
1. Page plein écran 1920×1080, thème sombre, Vite + React + Tailwind : `Dashboard.tsx` (grille `h-full w-full`, tokens sombres de `styles.css`), Playwright à 1920×1080 (Task 10).
2. Gauche 55 % vue spectateur 3D orbitable (frustums, bras, panier, plant venant de M1-M3) : `grid-cols-[55fr_45fr]`, `SpectatorView` conservé avec `data-testid="spectator"` (Task 9).
3. Droite haut : trois vues annotées telles que reçues, clic pour agrandir, flash bref à chaque `get_views` : `ViewsPanel` (images du message `views`, dialogue agrandi, `useFlash(lastViewsAt, 400)`), `reduceServer` case `views` (Tasks 3, 8) ; repli `AgentViews` de M3 sans pont.
4. Droite bas : trace plus récent en haut, texte, tool calls en langage clair avec arguments, résultats, durée, erreurs surlignées : `reduceServer` (ordre et plafond 200, rapprochement `callId`), `toolTitle` (Task 2), `TraceRow` (`data-ok="false"`, bordure et fond rouge mûr, durée en monospace) (Task 7).
5. Bandeau haut : pastilles de phase, compteurs récoltées/ratées, temps sim et facteur, modèle, coût cumulé : `StatusBar` avec `PHASES`/`PHASE_LABEL`, `counters`, `useWorldClock`, `model` (défaut du contrat puis `/health`), `costUsd` cumulé par `episode_end` (Tasks 3, 6, 7) ; en plus l'état de connexion et le détecteur actif demandés par le contrat (`perceptionInfo`, Task 4).
6. Bandeau bas repliable : schéma bloc Simulation → Perception → Serveur MCP → Agent → Dashboard, bus d'événements, bloc et flèche actifs allumés à chaque message : `blockLayout` (Task 5), `BlockDiagram` (SVG inline, `useFlash(atMs, 600)`, bouton `aria-expanded`, touche `b`), `reduceServer` case `block_activity` (Tasks 3, 8, 9).
7. Contrôles de tournage : pause, vitesse, mûrir la prochaine tomate, nouveau plant, replay, masquer les contrôles, mode « ce que voit l'agent » : `Controls` (`runtime.apply`, Task 8), `ReplayPanel` + `episodesApi` + `createFakeBridge` (Tasks 1, 4, 8), touches `h` et `v` dans `Dashboard` (Task 9), mise en page 30/70 en mode agent.
8. Palette (rouge mûr, vert immature, orange, cyan tige, magenta ciseaux, jaune panier, blanc, gris axes) : tokens `@theme` de `styles.css` (Task 6), utilisés pour les pastilles de phase, les bordures de trace, le bloc actif.
Spec section 8 : réducteur, mise en forme, gestion du flash (horodatages injectés) testés en Node ; composants `StatusBar` et `TracePanel` sous jsdom ; Playwright pour la page. Spec section 9 (condition de passage) : « le dashboard affiche la trace et les vues d'un épisode rejoué » = `dashboard.spec.ts` avec `demoScript` + `fakeBridge`, et le replay d'un fichier d'épisode réel via `ReplayPanel` dès que M5 écrit `data/episodes/`. Spec section 10 : le schéma bloc animé est isolé dans `BlockDiagram` (coupe n° 2 possible sans toucher au reste) ; le replay dans `ReplayPanel` + `episodesApi` (coupe n° 5).

**Scan des placeholders :** aucun `TODO`, aucun « similaire à », aucun code tronqué ; chaque fichier de la structure a son contenu complet dans une tâche, et ce contenu est celui qui a passé `tsc`, `eslint`, `vitest` et `vite build` dans la copie de vérification.

**Cohérence des types :** `DashboardBridge.onStatus` accepte un retour `void` pour rester assignable depuis le `Bridge` de M5 quelle que soit sa signature exacte ; `createFakeBridge` est vérifié assignable à `DashboardBridge` par un test de type (`bridgeSlot.test.ts`) ; `ScriptEntry` a la même forme que `messages[]` du journal d'épisode (`{ atMs, message }`), donc `toScript` ne convertit rien ; `reduce(state, message, nowMs)` garde la signature du contrat avec `nowMs` optionnel ; `TraceEntry` étend le contrat avec `id` et `callId` sans retirer de champ ; `exactOptionalPropertyTypes` respecté (entrées de trace construites sans `detail: undefined`, `window.__tomato` composé conditionnellement, `data-ok={undefined}` omis par React) ; `noUncheckedIndexedAccess` : `state.trace[idx]` vérifié, `sorted[0]?.atMs`, `state.tomatoes[0]?.id` ; `useSyncExternalStore` reçoit `store.subscribe(fn: () => void)` et `store.get` (snapshot immuable) ; `useWorldClock` renvoie une chaîne stable par valeur.

**Points d'attention à l'exécution :** (1) StrictMode double-monte `SpectatorView` en dev comme avant ce plan ; `onSceneReady` pose un drapeau `cancelled` pour ignorer le runtime de la première passe ; (2) `import.meta.glob` exige un motif littéral : ne pas le transformer en variable ; (3) si le judge ou le visual-checker lance `npm run shot` alors qu'un `vite` d'un autre worktree occupe le port 5173, Playwright réutilise ce serveur et teste la mauvaise page : arrêter l'autre serveur ; (4) le bloc Dashboard n'est allumé que 600 ms après `episode_end` : la capture `dashboard.png` est prise juste après l'apparition de « Épisode terminé », donc en général pendant l'allumage, et l'en-tête du schéma affiche de toute façon « server → dashboard : episode_end » ; (5) la capture de fin d'épisode peut montrer la pastille « récoltée » ou « repos » selon le moment (le script repasse en `idle` une seconde plus tard) : les deux sont conformes ; (6) sans M1 mergé (impossible en Étape 3, mais possible dans un worktree de test), `demoScript` prend `tomatoId = 1` et les vues manquent : le test Playwright passe quand même (`hasViews` false).
