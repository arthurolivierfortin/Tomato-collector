# Étape 3 — M5 Serveur : MCP streamable HTTP, hub WebSocket, phases, journal, replay : plan d'implémentation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Livrer le processus Node `@tomato/server` (issue GitHub #5) : hub WebSocket sur `ws://localhost:7332` (un client `sim`, N dashboards, `snapshot` à la connexion), pont vers la sim corrélé par `requestId` avec délai de 15 s, machine à états des phases appliquée côté serveur (avec file d'attente des `ripe_detected`), journal des épisodes dans `data/episodes/<episodeId>.json` relu par `GET /episodes` et `GET /episodes/:id` (replay), serveur MCP « tomato-robot » exposant les neuf outils de `ToolSchemas` en streamable HTTP sur `http://localhost:7331/mcp`, diffusion `tool_call_start` / `tool_call_result` avec résumé français, garde `MAX_TOOL_CALLS_PER_EPISODE`, point d'entrée avec variables d'environnement et crochet `AgentRunner` (runner inerte tant que M6 n'est pas là ou que `TOMATO_AGENT=off`). Côté navigateur : le client WebSocket de la page sim (`createBridge`, état à 5 Hz, reconnexion 2 s) et l'interface simulée `createFakeBridge` pour M7. Le test d'intégration de fin d'étape (`packages/server/src/integration/episode.test.ts`) fait aboutir un épisode scripté en `harvested`, un autre en `missed`, et vérifie le journal.

**Architecture:** Tout le code serveur est dans `packages/server/src/` : `hub/` (WebSocket, `ws`), `sim/` (pont et corrélation), `state/` (règles pures des phases + session), `episodes/` (journal), `mcp/` (formatage pur, handlers des outils, enveloppe commune, serveur MCP), `http/` (Express : `/mcp`, `/health`, `/episodes`), `agentRunner.ts` (contrat M6 + runner inerte + chargeur), `index.ts` (câblage), `testing/` (faux hub / sim / journal / client MCP pour les tests), `integration/` (sim scriptée sur un vrai WebSocket + test de fin d'étape). Les règles (phases, formatage, réduction scriptée) sont pures et testées sous Vitest Node ; le hub et le test d'intégration utilisent un vrai serveur `ws` sur un port éphémère ; le serveur MCP est testé par le client du SDK relié en mémoire (`InMemoryTransport`) et, pour `/mcp`, par le transport client HTTP du SDK (celui que Claude Code utilise). Côté sim, `packages/sim/src/bridge/` contient le client WebSocket (socket injectable pour les tests Node) et le bridge simulé ; `App.tsx` crée le bridge après le runtime et l'expose dans `window.__tomato.bridge`.

**Tech Stack:** Node 22, TypeScript 5.9 strict (`exactOptionalPropertyTypes`, `noUncheckedIndexedAccess`), ESLint `consistent-type-imports`, Vitest 3 (Node), `@modelcontextprotocol/sdk` 1.30.0, `express` 5.2.1, `ws` 8.21.3 (+ `@types/ws` 8.18.1, `@types/express` 5.0.6), `tsx` 4.23.13, zod 3.25 (déjà dans `shared`).

**Spec:** `docs/superpowers/specs/2026-09-17-tomato-harvest-demo-design.md` (sections 3, 5, 8, 9) ; contrat inter-modules : `docs/superpowers/plans/2026-09-17-etape-3-architecture.md` (« Processus et ports », « Serveur (M5) », « Pont côté sim (M5) », « Vérification de fin d'étape ») ; socle sim : `docs/superpowers/plans/2026-09-17-etape-2-architecture.md` ; checklist : `docs/superpowers/specs/2026-09-17-etape-3-m5-serveur-checklist.md`.

## Global Constraints

- Un module = ses dossiers : M5 écrit dans `packages/server/**` (sauf `packages/server/src/agent/**` et `packages/server/prompts/`, réservés à M6), `packages/sim/src/bridge/`, la ligne de création du bridge dans `packages/sim/src/App.tsx`, et le script `dev:server` du `package.json` racine. `packages/shared` est figé : ne pas y toucher.
- Unités : centimètres et degrés. Repère monde : X droite, Y arrière, Z haut. Les résumés diffusés au dashboard sont en français, nombres avec virgule (« 1,4 cm », « 62° »).
- Aucune exception ne part vers l'agent : chaque outil renvoie un texte (`ok : …`, `<code> : …`, `invalid_argument : …`, `not_available : …`, « limite atteinte … »). Le SDK MCP valide lui-même les arguments contre `ToolSchemas` avant d'appeler le handler et répond par une erreur JSON-RPC `InvalidParams` (`Input validation error: …`), que le client (Claude Code, Agent SDK) présente au modèle comme un texte d'erreur : vérifié dans `@modelcontextprotocol/sdk/dist/esm/server/mcp.js` (ligne 178) et par le test `createMcpServer.test.ts`. Les handlers revalident quand même avec `safeParse` pour que tout autre chemin d'appel (tests, réutilisation) produise le texte `invalid_argument : …`.
- Pas de `any`, pas de dépendance native, fichiers < 200 lignes, `packages/server` reste `"type": "module"`. `import.meta.dirname` (Node ≥ 20.11, déjà utilisé par `tests/scene.spec.ts`).
- Ports : MCP + HTTP annexe 7331, hub WebSocket 7332, liés à `127.0.0.1` (spec MCP : un serveur local se lie à localhost). Les tests utilisent le port 0 (éphémère) et ne touchent jamais 7331/7332.
- Les interfaces `Hub`, `Session`, `SimBridge`, `Bridge`, `createFakeBridge` sont celles du contrat de l'Étape 3 ; les ajouts (méthodes supplémentaires listées dans chaque tâche) n'en retirent rien. M6 consomme `Hub`, `Session`, `AgentRunner`/`AgentRunnerDeps` (`packages/server/src/agentRunner.ts`) ; M7 consomme `Bridge` et `createFakeBridge`.
- **Vérifications faites (2026-09-17) sur les paquets installés, pas de mémoire :** `@modelcontextprotocol/sdk` 1.30.0 (npm `latest` ; la branche `main` du dépôt GitHub documente déjà une v2 en paquets séparés `@modelcontextprotocol/server`, hors sujet ici) : `McpServer.registerTool(name, { description, inputSchema }, cb)` accepte en `inputSchema` un `ZodObject` v3 (`AnySchema = z3.ZodTypeAny | z4.$ZodType`, `server/zod-compat.d.ts`) et `cb` reçoit `z.infer` du schéma ; résultat `{ content: [{ type: 'text', text }, { type: 'image', data, mimeType }], isError? }` (`types.d.ts`, `ImageContentSchema` = `type`, `data`, `mimeType`) ; `StreamableHTTPServerTransport(options)` en mode **sans session** quand `sessionIdGenerator` est omis (`webStandardStreamableHttp.d.ts` ligne 46 : « If not provided, session management is disabled (stateless mode) ») ; en mode sans session « each request must use a fresh transport » (`webStandardStreamableHttp.js` ligne 172), d'où un transport et un `McpServer` neufs par requête, fermés sur `res.on('close')` ; `transport.handleRequest(req, res, req.body)` avec `express.json()` ; `InMemoryTransport.createLinkedPair()` (`inMemory.d.ts`), `Client` (`client/index.d.ts` : `connect`, `listTools`, `callTool({ name, arguments })`), `StreamableHTTPClientTransport(new URL(url))` (`client/streamableHttp.d.ts`) qui traite un 405 sur `GET` comme « pas de flux SSE » et sur `DELETE` comme « pas de terminaison de session » (lignes 101-103 et 447-448) ; avec `exactOptionalPropertyTypes`, la classe du transport (`onclose: (() => void) | undefined`) n'est pas assignable à l'interface `Transport` (`onclose?: () => void`) : un cast `as Transport` localisé est nécessaire (deux endroits, commentés). Spec MCP 2025-06-18, transports : le serveur DOIT répondre `text/event-stream` ou **405** à `GET` ; `Mcp-Session-Id` est optionnel côté serveur ; `DELETE` peut recevoir 405. `ws` 8.21.3 + `@types/ws` 8.18.1 : `new WebSocketServer({ port, host })`, événements `listening`, `connection (socket)`, `message (data, isBinary)`, `close`, `error` ; `wss.clients`, `wss.address()`, `wss.close(cb)` ; `socket.send`, `socket.readyState === WebSocket.OPEN`, `socket.terminate()` ; import ESM nommé `import { WebSocket, WebSocketServer } from 'ws'` vérifié par `tsc`. `tsx` 4.23.13 : `tsx <script>` et `tsx watch <script>` (sortie de `npx tsx --help`). Claude Code : `claude mcp add --transport http <name> <url>` (https://code.claude.com/docs/en/mcp) ; Agent SDK : `mcpServers: { robot: { type: 'http', url } }` : compatibles avec le mode sans session. Express 5.2.1 : `app.listen(port, host, cb)`, handlers async, `req.params.id` typé `string` avec `Request<{ id: string }>`.
- Gates par PR : `npm run lint`, `npm run typecheck`, `npm test`, `npm run build`, plus `npm run shot` (App.tsx est touché : `data/shots/scene.png` doit toujours être produit).
- Le builder travaille dans un worktree sur la branche `feat/5-m5-serveur` (voir `.claude/agents/builder.md`). M1, M2, M3 peuvent être mergés ou non : `App.tsx` est écrit pour les deux cas (règles de fusion en Task 15) et le bridge lit `window.__tomato.renderViews` à chaque demande (présent après M3, sinon vues sans image).

---

## Structure de fichiers

```
package.json                                   + script dev:server
packages/server/
  package.json                                 dépendances épinglées, scripts dev/start/typecheck/build
  src/version.ts, version.test.ts              VERSION (remplace index.test.ts : index.ts devient le point d'entrée)
  src/log.ts                                   Logger, consoleLogger, silentLogger
  src/config.ts, config.test.ts                readConfig(env) : TOMATO_MCP_PORT, TOMATO_WS_PORT, TOMATO_MODEL, TOMATO_AGENT, TOMATO_EPISODES_DIR (pur)
  src/state/rules.ts, rules.test.ts            règles de phase pures : phasesAfterToolResult, phaseAfterLanding, outcomeForPhase, phasesToClose
  src/episodes/journal.ts, journal.test.ts     createEpisodeJournal(dir) : open/record/close/list/read, patch tardif d'episode_end
  src/hub/hub.ts, hub.test.ts                  createHub(port) : ws, hello, snapshot, routage sim, broadcast, remplacement du client sim
  src/sim/viewsFallback.ts                     viewsPayloadOf, emptyViews (pur)
  src/sim/simBridge.ts, simBridge.test.ts      createSimBridge(hub) : requestId, délai 15 s, latestState, onEvent
  src/testing/fakes.ts                         createFakeHub, createFakeSim, createMemoryJournal (tests)
  src/state/session.ts, session.test.ts        createSession(hub, deps) : phases, épisodes, file d'attente, réveil
  src/mcp/format.ts, format.test.ts            blocs texte/image, fr(), viewHeader, actionResultText, summarizeAction (pur)
  src/mcp/handlers.ts, handlers.test.ts        createToolHandlers(deps) : les neuf outils, safeParse → invalid_argument
  src/mcp/toolRunner.ts                        createToolRunner : tool_call_start/result, block_activity, garde MAX_TOOL_CALLS_PER_EPISODE
  src/mcp/createMcpServer.ts, createMcpServer.test.ts   McpServer « tomato-robot », registerTool × 9 ; test via InMemoryTransport
  src/testing/mcpClient.ts                     connectInMemory(server), blocksOf (tests)
  src/http/app.ts, app.test.ts                 Express : POST /mcp (sans session), GET/DELETE /mcp → 405, /health, /episodes, /episodes/:id
  src/agentRunner.ts, agentRunner.test.ts      AgentRunner, AgentRunnerDeps, createNoopRunner, loadAgentRunner (M6 : src/agent/index.ts)
  src/testing/fakeAgent.ts                     module d'agent factice pour tester le chargeur
  src/index.ts                                 point d'entrée : env, hub, bridge, journal, session, Express, runner
  src/integration/scriptedSim.ts               sim scriptée sur un vrai WebSocket (réducteur pur + atterrissage)
  src/integration/episode.test.ts              fin d'étape : harvested, missed, coupe misaligned, journal écrit
packages/sim/src/bridge/
  viewsFallback.ts                             viewsPayloadOf, emptyViews (copie locale : M3 n'est pas une dépendance)
  bridge.ts, bridge.test.ts                    createBridge : hello, état 5 Hz, apply_action/render_views, sim_event, reconnexion 2 s ; SocketLike injectable
  fakeBridge.ts, fakeBridge.test.ts            createFakeBridge(script, speed) pour M7
packages/sim/src/App.tsx                       création du bridge après le runtime, window.__tomato.bridge, fermeture au démontage
docs/superpowers/specs/2026-09-17-etape-3-m5-serveur-checklist.md
```

---

### Task 1: Dépendances, scripts et version

**Files:**
- Modify: `packages/server/package.json`, `package.json` (racine), `package-lock.json` (par `npm install`)
- Create: `packages/server/src/version.ts`, `packages/server/src/version.test.ts`
- Delete: `packages/server/src/index.test.ts` (il importait `./index`, qui devient un point d'entrée avec effets de bord ; le test de version le remplace)

**Interfaces:**
- Produces: `VERSION = '0.2.0'` ; scripts `npm run dev:server` (racine) → `tsx watch src/index.ts`, `npm run start -w @tomato/server` → `tsx src/index.ts`.

- [ ] **Step 1: `packages/server/package.json`**

`packages/server/package.json` :

```json
{
  "name": "@tomato/server",
  "version": "0.2.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "tsx watch src/index.ts",
    "start": "tsx src/index.ts",
    "typecheck": "tsc --noEmit",
    "build": "tsc --noEmit"
  },
  "dependencies": {
    "@modelcontextprotocol/sdk": "1.30.0",
    "@tomato/shared": "*",
    "express": "5.2.1",
    "ws": "8.21.3"
  },
  "devDependencies": {
    "@types/express": "5.0.6",
    "@types/node": "^26.6.1",
    "@types/ws": "8.18.1",
    "tsx": "4.23.13"
  }
}
```

- [ ] **Step 2: `package.json` racine (ajout de `dev:server`, rien d'autre ne change)**

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
    "dev:server": "npm run dev -w @tomato/server",
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

- [ ] **Step 3: Installer**

Run: `npm install`
Expected: exit 0 ; `node_modules/@modelcontextprotocol/sdk/package.json` indique `"version": "1.30.0"` ; `node -e "console.log(require('./node_modules/zod/package.json').version)"` affiche `3.25.x` (le SDK accepte `^3.25 || ^4.0`).

- [ ] **Step 4: Version et son test**

`packages/server/src/version.ts` :

```ts
export const VERSION = '0.2.0';
```

`packages/server/src/version.test.ts` :

```ts
import { describe, expect, it } from 'vitest';
import { VERSION } from './version';

describe('server package', () => {
  it('exposes a semver version', () => {
    expect(VERSION).toMatch(/^\d+\.\d+\.\d+$/);
  });
});
```

Supprimer `packages/server/src/index.test.ts` (`git rm packages/server/src/index.test.ts`). `packages/server/src/index.ts` garde pour l'instant son contenu de l'Étape 1 (`export const VERSION = '0.1.0';`) : il est réécrit en Task 12.

- [ ] **Step 5: Vérifier**

Run: `npx vitest run packages/server && npm run typecheck`
Expected: PASS, 1 test (version) ; typecheck exit 0.

- [ ] **Step 6: Commit**

```bash
git add package.json package-lock.json packages/server/package.json packages/server/src/version.ts packages/server/src/version.test.ts
git rm -q packages/server/src/index.test.ts
git commit -m "chore(server): dépendances MCP SDK 1.30, express 5, ws 8, tsx ; scripts dev/start ; version 0.2.0"
```

---

### Task 2: Logger et configuration par variables d'environnement

**Files:**
- Create: `packages/server/src/log.ts`, `packages/server/src/config.ts`, `packages/server/src/config.test.ts`

**Interfaces:**
- Produces: `type Logger = (line: string) => void`, `consoleLogger`, `silentLogger` ; `interface ServerConfig { mcpPort: number; wsPort: number; model: string; agent: 'on' | 'off'; episodesDir: string }`, `DEFAULT_MCP_PORT = 7331`, `DEFAULT_WS_PORT = 7332`, `DEFAULT_MODEL = 'claude-opus-5'`, `DEFAULT_EPISODES_DIR` (= `<racine>/data/episodes`), `readConfig(env: Record<string, string | undefined>): ServerConfig`.

- [ ] **Step 1: Test (échoue)**

`packages/server/src/config.test.ts` :

```ts
import { describe, expect, it } from 'vitest';
import { DEFAULT_MCP_PORT, DEFAULT_MODEL, DEFAULT_WS_PORT, readConfig } from './config';

describe('readConfig', () => {
  it('uses the documented defaults when nothing is set', () => {
    const c = readConfig({});
    expect(c.mcpPort).toBe(DEFAULT_MCP_PORT);
    expect(c.wsPort).toBe(DEFAULT_WS_PORT);
    expect(c.model).toBe(DEFAULT_MODEL);
    expect(c.agent).toBe('on');
    expect(c.episodesDir.replace(/\\/g, '/')).toMatch(/data\/episodes$/);
  });

  it('reads TOMATO_* variables and ignores invalid ports', () => {
    const c = readConfig({
      TOMATO_MCP_PORT: '8000',
      TOMATO_WS_PORT: 'abc',
      TOMATO_MODEL: ' claude-sonnet-5 ',
      TOMATO_AGENT: 'off',
      TOMATO_EPISODES_DIR: '/tmp/ep',
    });
    expect(c.mcpPort).toBe(8000);
    expect(c.wsPort).toBe(DEFAULT_WS_PORT);
    expect(c.model).toBe('claude-sonnet-5');
    expect(c.agent).toBe('off');
    expect(c.episodesDir).toBe('/tmp/ep');
  });
});
```

- [ ] **Step 2: Vérifier l'échec**

Run: `npx vitest run packages/server/src/config.test.ts`
Expected: FAIL, module `./config` introuvable.

- [ ] **Step 3: Écrire `log.ts`**

`packages/server/src/log.ts` :

```ts
/** Journalisation minimale du serveur : une ligne horodatée sur stdout ; silencieuse dans les tests. */
export type Logger = (line: string) => void;

export const consoleLogger: Logger = (line) => {
  console.log(`[${new Date().toISOString()}] ${line}`);
};

export const silentLogger: Logger = () => undefined;
```

- [ ] **Step 4: Écrire `config.ts`**

`packages/server/src/config.ts` :

```ts
import { resolve } from 'node:path';

export interface ServerConfig {
  /** Port HTTP : MCP (`/mcp`), `/health`, `/episodes`. */
  mcpPort: number;
  /** Port du hub WebSocket (sim et dashboards). */
  wsPort: number;
  /** Modèle de l'agent (M6). */
  model: string;
  /** `off` : aucun runner d'agent, pilotage à la main depuis Claude Code. */
  agent: 'on' | 'off';
  /** Dossier des journaux d'épisodes. */
  episodesDir: string;
}

export const DEFAULT_MCP_PORT = 7331;
export const DEFAULT_WS_PORT = 7332;
export const DEFAULT_MODEL = 'claude-opus-5';
/** `packages/server/src` → racine du dépôt → `data/episodes`. */
export const DEFAULT_EPISODES_DIR = resolve(import.meta.dirname, '../../../data/episodes');

function readPort(raw: string | undefined, fallback: number): number {
  if (raw === undefined || raw === '') return fallback;
  const n = Number(raw);
  return Number.isInteger(n) && n >= 0 && n <= 65535 ? n : fallback;
}

function nonEmpty(raw: string | undefined, fallback: string): string {
  const v = raw?.trim();
  return v !== undefined && v !== '' ? v : fallback;
}

/** Lit les variables d'environnement TOMATO_* ; toute valeur absente ou invalide prend la valeur par défaut. */
export function readConfig(env: Record<string, string | undefined>): ServerConfig {
  return {
    mcpPort: readPort(env.TOMATO_MCP_PORT, DEFAULT_MCP_PORT),
    wsPort: readPort(env.TOMATO_WS_PORT, DEFAULT_WS_PORT),
    model: nonEmpty(env.TOMATO_MODEL, DEFAULT_MODEL),
    agent: env.TOMATO_AGENT === 'off' ? 'off' : 'on',
    episodesDir: nonEmpty(env.TOMATO_EPISODES_DIR, DEFAULT_EPISODES_DIR),
  };
}
```

- [ ] **Step 5: Vérifier le succès**

Run: `npx vitest run packages/server/src/config.test.ts`
Expected: PASS, 2 tests.

- [ ] **Step 6: Commit**

```bash
git add packages/server/src/log.ts packages/server/src/config.ts packages/server/src/config.test.ts
git commit -m "feat(server): logger et configuration TOMATO_* (ports, modèle, agent, dossier des épisodes)"
```

---

### Task 3: Règles de phase pures

**Files:**
- Create: `packages/server/src/state/rules.ts`, `packages/server/src/state/rules.test.ts`

**Interfaces:**
- Consumes: `Phase`, `ToolName` de `@tomato/shared`.
- Produces: `type EpisodeOutcome = 'harvested' | 'missed' | 'aborted'`, `MOVEMENT_TOOLS`, `phasesAfterToolResult(phase, tool, ok): Phase[]`, `phaseAfterLanding(phase, inBasket): Phase | null`, `outcomeForPhase(phase): EpisodeOutcome`, `phasesToClose(phase): Phase[] | null`.

Règles du contrat : premier outil de mouvement (`move_scissors`, `rotate_scissors`, `open_scissors`, `move_basket`, `cut`) en `detected` → `harvesting` ; `cut` réussi → `cutting` puis `falling` ; `tomato_landed` en `falling` → `harvested` / `missed` ; `report` → `idle` depuis `harvested`/`missed`/`aborted`, via `aborted` depuis `detected`/`harvesting`/`cutting`, impossible pendant `falling` (la chute se termine en 3 s sim), sans objet en `idle`. L'issue réelle vient de la phase, jamais de ce que l'agent déclare.

- [ ] **Step 1: Test (échoue)**

`packages/server/src/state/rules.test.ts` :

```ts
import { describe, expect, it } from 'vitest';
import { outcomeForPhase, phaseAfterLanding, phasesAfterToolResult, phasesToClose } from './rules';

describe('phasesAfterToolResult', () => {
  it('first movement tool moves detected → harvesting; camera and status do not', () => {
    expect(phasesAfterToolResult('detected', 'move_basket', true)).toEqual(['harvesting']);
    expect(phasesAfterToolResult('detected', 'move_camera', true)).toEqual([]);
    expect(phasesAfterToolResult('detected', 'get_views', true)).toEqual([]);
    expect(phasesAfterToolResult('harvesting', 'move_scissors', true)).toEqual([]);
  });

  it('a successful cut goes cutting then falling, even straight from detected', () => {
    expect(phasesAfterToolResult('harvesting', 'cut', true)).toEqual(['cutting', 'falling']);
    expect(phasesAfterToolResult('detected', 'cut', true)).toEqual(['harvesting', 'cutting', 'falling']);
    expect(phasesAfterToolResult('harvesting', 'cut', false)).toEqual([]);
  });
});

describe('phaseAfterLanding', () => {
  it('decides harvested or missed only while falling', () => {
    expect(phaseAfterLanding('falling', true)).toBe('harvested');
    expect(phaseAfterLanding('falling', false)).toBe('missed');
    expect(phaseAfterLanding('harvesting', true)).toBeNull();
  });
});

describe('outcomeForPhase and phasesToClose', () => {
  it('derive the outcome from the phase, never from the agent claim', () => {
    expect(outcomeForPhase('harvested')).toBe('harvested');
    expect(outcomeForPhase('missed')).toBe('missed');
    expect(outcomeForPhase('harvesting')).toBe('aborted');
  });

  it('close through aborted when unfinished, wait during falling, nothing when idle', () => {
    expect(phasesToClose('harvested')).toEqual(['idle']);
    expect(phasesToClose('cutting')).toEqual(['aborted', 'idle']);
    expect(phasesToClose('falling')).toBeNull();
    expect(phasesToClose('idle')).toBeNull();
  });
});
```

- [ ] **Step 2: Vérifier l'échec**

Run: `npx vitest run packages/server/src/state/rules.test.ts`
Expected: FAIL, module `./rules` introuvable.

- [ ] **Step 3: Écrire `rules.ts`**

`packages/server/src/state/rules.ts` :

```ts
import type { Phase, ToolName } from '@tomato/shared';

export type EpisodeOutcome = 'harvested' | 'missed' | 'aborted';

/** Outils dont le premier appel fait passer de `detected` à `harvesting`. */
export const MOVEMENT_TOOLS: ReadonlySet<ToolName> = new Set<ToolName>([
  'move_scissors', 'rotate_scissors', 'open_scissors', 'move_basket', 'cut',
]);

const CUT_SEQUENCE: readonly Phase[] = ['cutting', 'falling'];

/** Phases à enchaîner après le résultat d'un outil (vide = rien ne change). */
export function phasesAfterToolResult(phase: Phase, tool: ToolName, ok: boolean): Phase[] {
  const out: Phase[] = [];
  let current = phase;
  if (MOVEMENT_TOOLS.has(tool) && current === 'detected') {
    out.push('harvesting');
    current = 'harvesting';
  }
  if (tool === 'cut' && ok && current === 'harvesting') out.push(...CUT_SEQUENCE);
  return out;
}

/** `tomato_landed` ne décide que pendant la chute. */
export function phaseAfterLanding(phase: Phase, inBasket: boolean): Phase | null {
  if (phase !== 'falling') return null;
  return inBasket ? 'harvested' : 'missed';
}

/** Issue réelle d'un épisode d'après la phase où il se termine (la vérité vient de la sim, pas de l'agent). */
export function outcomeForPhase(phase: Phase): EpisodeOutcome {
  if (phase === 'harvested' || phase === 'missed') return phase;
  return 'aborted';
}

/**
 * Phases à enchaîner pour clore un épisode depuis `phase` ; null si la clôture est impossible
 * pour l'instant (chute en cours) ou sans objet (idle).
 */
export function phasesToClose(phase: Phase): Phase[] | null {
  switch (phase) {
    case 'harvested':
    case 'missed':
    case 'aborted':
      return ['idle'];
    case 'detected':
    case 'harvesting':
    case 'cutting':
      return ['aborted', 'idle'];
    case 'falling':
    case 'idle':
      return null;
  }
}
```

- [ ] **Step 4: Vérifier le succès**

Run: `npx vitest run packages/server/src/state/rules.test.ts`
Expected: PASS, 5 tests.

- [ ] **Step 5: Commit**

```bash
git add packages/server/src/state/rules.ts packages/server/src/state/rules.test.ts
git commit -m "feat(server): règles de phase pures (outils, atterrissage, clôture d'épisode)"
```

---

### Task 4: Journal des épisodes

**Files:**
- Create: `packages/server/src/episodes/journal.ts`, `packages/server/src/episodes/journal.test.ts`

**Interfaces:**
- Consumes: `ServerToDashboard` de `@tomato/shared`, `EpisodeOutcome`, `Logger`.
- Produces: `interface JournalEntry { atMs: number; message: ServerToDashboard }`, `interface EpisodeRecord { episodeId; tomatoId; startedAt; endedAt; outcome; note; messages: JournalEntry[]; toolCalls; costUsd }`, `interface EpisodeSummary { episodeId; startedAt; outcome; tomatoId }`, `interface EpisodeJournal { open(episodeId, tomatoId); record(message); close(outcome, note, toolCalls): Promise<void>; current(); list(); read(episodeId); flush() }`, `EPISODE_ID_PATTERN`, `createEpisodeJournal(dir, { now?, log? })`.
- Décision : `episode_end` est diffusé par le runner M6 (coût et durée depuis le message `result` de l'Agent SDK), donc APRÈS le `report` qui clôt le journal ; le journal accepte ce message tardif pour l'épisode qui vient de se clore et met à jour `costUsd` (fichier réécrit). Les écritures sont sérialisées ; `flush()` les attend (tests).

- [ ] **Step 1: Test (échoue)**

`packages/server/src/episodes/journal.test.ts` :

```ts
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createEpisodeJournal, type EpisodeJournal } from './journal';

let dir: string;
let clock = 1_000_000;
let journal: EpisodeJournal;

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'tomato-journal-'));
  clock = 1_000_000;
  journal = createEpisodeJournal(dir, { now: () => clock });
});

afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

describe('episode journal', () => {
  it('writes one JSON file per episode with timestamped messages and reads it back', async () => {
    journal.open('ep-1', 3);
    expect(journal.current()).toBe('ep-1');
    clock += 250;
    journal.record({ type: 'phase', phase: 'detected', reason: 'tomate 3 mûre' });
    clock += 100;
    journal.record({ type: 'tool_call_start', episodeId: 'ep-1', callId: 'c1', tool: 'cut', args: {} });
    await journal.close('harvested', 'coupe nette', 7);
    expect(journal.current()).toBeNull();

    const raw = JSON.parse(await readFile(join(dir, 'ep-1.json'), 'utf8')) as { messages: { atMs: number }[]; outcome: string };
    expect(raw.outcome).toBe('harvested');
    expect(raw.messages.map((m) => m.atMs)).toEqual([250, 350]);

    const record = await journal.read('ep-1');
    expect(record).not.toBeNull();
    expect(record!.tomatoId).toBe(3);
    expect(record!.toolCalls).toBe(7);
    expect(record!.note).toBe('coupe nette');
    expect(record!.startedAt).toBe(new Date(1_000_000).toISOString());
    expect(record!.endedAt).toBe(new Date(1_000_350).toISOString());
    expect(record!.messages[1]!.message.type).toBe('tool_call_start');
  });

  it('lists episodes as summaries, ignores messages outside an episode, and rejects unsafe ids', async () => {
    journal.record({ type: 'phase', phase: 'idle', reason: 'ignoré' });
    journal.open('ep-a', 1);
    await journal.close('missed', '', 2);
    journal.open('ep-b', 2);
    await journal.close('aborted', '', 0);
    expect(await journal.list()).toEqual([
      { episodeId: 'ep-a', startedAt: new Date(1_000_000).toISOString(), outcome: 'missed', tomatoId: 1 },
      { episodeId: 'ep-b', startedAt: new Date(1_000_000).toISOString(), outcome: 'aborted', tomatoId: 2 },
    ]);
    expect(await journal.read('../ep-a')).toBeNull();
    expect(await journal.read('nope')).toBeNull();
    expect((await journal.read('ep-a'))!.messages).toEqual([]);
  });

  it('patches the cost from a late episode_end of the episode that just closed', async () => {
    journal.open('ep-c', 4);
    await journal.close('harvested', 'ok', 5);
    journal.record({ type: 'episode_end', episodeId: 'ep-c', outcome: 'harvested', note: 'ok', toolCalls: 5, costUsd: 0.42, durationMs: 9000 });
    await journal.flush();
    const r = await journal.read('ep-c');
    expect(r!.costUsd).toBe(0.42);
    expect(r!.messages.at(-1)!.message.type).toBe('episode_end');
    journal.record({ type: 'episode_end', episodeId: 'other', outcome: 'missed', note: '', toolCalls: 0, costUsd: 9, durationMs: 1 });
    await journal.flush();
    expect((await journal.read('ep-c'))!.costUsd).toBe(0.42);
  });

  it('returns an empty list when the directory does not exist yet', async () => {
    expect(await createEpisodeJournal(join(dir, 'missing')).list()).toEqual([]);
  });
});
```

- [ ] **Step 2: Vérifier l'échec**

Run: `npx vitest run packages/server/src/episodes/journal.test.ts`
Expected: FAIL, module `./journal` introuvable.

- [ ] **Step 3: Écrire `journal.ts`**

`packages/server/src/episodes/journal.ts` :

```ts
import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { ServerToDashboard } from '@tomato/shared';
import { silentLogger, type Logger } from '../log';
import type { EpisodeOutcome } from '../state/rules';

export interface JournalEntry {
  /** Millisecondes depuis le début de l'épisode. */
  atMs: number;
  message: ServerToDashboard;
}

export interface EpisodeRecord {
  episodeId: string;
  tomatoId: number;
  startedAt: string;
  endedAt: string | null;
  outcome: EpisodeOutcome | null;
  note: string;
  messages: JournalEntry[];
  toolCalls: number;
  costUsd: number;
}

export interface EpisodeSummary {
  episodeId: string;
  startedAt: string;
  outcome: EpisodeOutcome | null;
  tomatoId: number;
}

export interface EpisodeJournal {
  open(episodeId: string, tomatoId: number): void;
  /** Enregistre un message diffusé ; hors épisode, seul un `episode_end` tardif de l'épisode qui vient de se clore est retenu (coût). */
  record(message: ServerToDashboard): void;
  close(outcome: EpisodeOutcome, note: string, toolCalls: number): Promise<void>;
  current(): string | null;
  list(): Promise<EpisodeSummary[]>;
  read(episodeId: string): Promise<EpisodeRecord | null>;
  /** Attend la fin des écritures en cours (tests). */
  flush(): Promise<void>;
}

export const EPISODE_ID_PATTERN = /^[A-Za-z0-9_-]+$/;

function emptyRecord(episodeId: string, tomatoId: number, startedMs: number): EpisodeRecord {
  return {
    episodeId, tomatoId, startedAt: new Date(startedMs).toISOString(), endedAt: null,
    outcome: null, note: '', messages: [], toolCalls: 0, costUsd: 0,
  };
}

export function createEpisodeJournal(dir: string, opts: { now?: () => number; log?: Logger } = {}): EpisodeJournal {
  const now = opts.now ?? Date.now;
  const log = opts.log ?? silentLogger;
  let open: { record: EpisodeRecord; startedMs: number } | null = null;
  let lastClosed: EpisodeRecord | null = null;
  let writes: Promise<void> = Promise.resolve();

  const write = (record: EpisodeRecord): Promise<void> => {
    writes = writes
      .then(async () => {
        await mkdir(dir, { recursive: true });
        await writeFile(join(dir, `${record.episodeId}.json`), JSON.stringify(record));
      })
      .catch((e: unknown) => log(`journal: écriture impossible (${String(e)})`));
    return writes;
  };

  return {
    open(episodeId, tomatoId) {
      const startedMs = now();
      open = { startedMs, record: emptyRecord(episodeId, tomatoId, startedMs) };
    },
    record(message) {
      if (open) {
        open.record.messages.push({ atMs: now() - open.startedMs, message });
        return;
      }
      if (message.type === 'episode_end' && lastClosed && lastClosed.episodeId === message.episodeId) {
        lastClosed.costUsd = message.costUsd;
        lastClosed.messages.push({ atMs: now() - Date.parse(lastClosed.startedAt), message });
        void write(lastClosed);
      }
    },
    close(outcome, note, toolCalls) {
      if (!open) return Promise.resolve();
      const { record } = open;
      open = null;
      record.endedAt = new Date(now()).toISOString();
      record.outcome = outcome;
      record.note = note;
      record.toolCalls = toolCalls;
      lastClosed = record;
      return write(record);
    },
    current: () => open?.record.episodeId ?? null,
    async list() {
      let files: string[];
      try {
        files = await readdir(dir);
      } catch {
        return [];
      }
      const out: EpisodeSummary[] = [];
      for (const f of files.filter((n) => n.endsWith('.json')).sort()) {
        try {
          const r = JSON.parse(await readFile(join(dir, f), 'utf8')) as EpisodeRecord;
          out.push({ episodeId: r.episodeId, startedAt: r.startedAt, outcome: r.outcome, tomatoId: r.tomatoId });
        } catch (e) {
          log(`journal: fichier ${f} illisible (${String(e)})`);
        }
      }
      return out;
    },
    async read(episodeId) {
      if (!EPISODE_ID_PATTERN.test(episodeId)) return null;
      try {
        return JSON.parse(await readFile(join(dir, `${episodeId}.json`), 'utf8')) as EpisodeRecord;
      } catch {
        return null;
      }
    },
    flush: () => writes,
  };
}
```

- [ ] **Step 4: Vérifier le succès**

Run: `npx vitest run packages/server/src/episodes/journal.test.ts`
Expected: PASS, 4 tests.

- [ ] **Step 5: Commit**

```bash
git add packages/server/src/episodes/journal.ts packages/server/src/episodes/journal.test.ts
git commit -m "feat(server): journal des épisodes data/episodes/<id>.json (écriture, liste, lecture, coût tardif)"
```

---

### Task 5: Hub WebSocket

**Files:**
- Create: `packages/server/src/hub/hub.ts`, `packages/server/src/hub/hub.test.ts`

**Interfaces:**
- Consumes: `parseMessage`, `createDefaultWorld`, `ClientRole`, `SimToServer`, `ServerToSim`, `ServerToDashboard` de `@tomato/shared` ; `WebSocket`, `WebSocketServer` de `ws`.
- Produces: `type Snapshot = Extract<ServerToDashboard, { type: 'snapshot' }>`, `interface Hub { onSimMessage(fn): () => void; sendToSim(m): boolean; broadcast(m): void; simConnected(): boolean; close(): Promise<void>; onBroadcast(fn): () => void; setSnapshot(fn: () => Snapshot): void; whenListening(): Promise<number> }`, `createHub(port, { host?, log? })`.
- Comportement : chaque client envoie d'abord `hello` ; un seul client `sim` (le nouveau remplace l'ancien, qui est fermé) ; le `snapshot` est envoyé à chaque client après son `hello` ; seuls `state`, `sim_event`, `action_result`, `views_result` venant du client sim sont routés vers `onSimMessage` ; tout le reste est ignoré et journalisé ; `broadcast` va à TOUS les clients connectés et aux observateurs `onBroadcast` (journal). Ajouts au contrat : `onBroadcast`, `setSnapshot`, `whenListening`, et `close()` renvoie une promesse (attente de la libération du port dans les tests).

- [ ] **Step 1: Test (échoue)**

`packages/server/src/hub/hub.test.ts` :

```ts
import { createDefaultWorld, type AnyMessage, type SimToServer } from '@tomato/shared';
import { WebSocket } from 'ws';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createHub, type Hub } from './hub';

interface TestClient {
  ws: WebSocket;
  /** Prochain message reçu (dans l'ordre). */
  next(): Promise<AnyMessage>;
  send(m: unknown): void;
  close(): Promise<void>;
}

async function connect(port: number): Promise<TestClient> {
  const ws = new WebSocket(`ws://127.0.0.1:${port}`);
  const queue: AnyMessage[] = [];
  const waiters: ((m: AnyMessage) => void)[] = [];
  ws.on('message', (data) => {
    const m = JSON.parse(String(data)) as AnyMessage;
    const w = waiters.shift();
    if (w) w(m);
    else queue.push(m);
  });
  await new Promise<void>((resolve, reject) => {
    ws.once('open', resolve);
    ws.once('error', reject);
  });
  return {
    ws,
    next: () => {
      const m = queue.shift();
      return m ? Promise.resolve(m) : new Promise((resolve) => waiters.push(resolve));
    },
    send: (m) => ws.send(JSON.stringify(m)),
    close: () =>
      new Promise((resolve) => {
        ws.once('close', () => resolve());
        ws.close();
      }),
  };
}

const tick = (): Promise<void> => new Promise((r) => setTimeout(r, 20));

let hub: Hub;
let port: number;
let logs: string[];

beforeEach(async () => {
  logs = [];
  hub = createHub(0, { log: (l) => logs.push(l) });
  port = await hub.whenListening();
});

afterEach(async () => {
  await hub.close();
});

describe('hub', () => {
  it('sends the snapshot after hello and routes sim messages only from the sim client', async () => {
    const received: SimToServer[] = [];
    hub.onSimMessage((m) => received.push(m));
    hub.setSnapshot(() => ({ type: 'snapshot', state: createDefaultWorld(7), phase: 'detected', episodeId: 'ep' }));

    const sim = await connect(port);
    const dash = await connect(port);
    sim.send({ type: 'hello', role: 'sim' });
    dash.send({ type: 'hello', role: 'dashboard' });
    const s1 = await sim.next();
    const s2 = await dash.next();
    expect(s1).toMatchObject({ type: 'snapshot', phase: 'detected', episodeId: 'ep' });
    expect(s2).toMatchObject({ type: 'snapshot', state: { seed: 7 } });
    expect(hub.simConnected()).toBe(true);

    sim.send({ type: 'sim_event', event: { type: 'plant_regenerated', seed: 3 } });
    dash.send({ type: 'sim_event', event: { type: 'plant_regenerated', seed: 4 } });
    dash.send('not json');
    sim.send({ type: 'phase', phase: 'idle', reason: 'pas un message sim' });
    await tick();
    expect(received).toEqual([{ type: 'sim_event', event: { type: 'plant_regenerated', seed: 3 } }]);
    expect(logs.some((l) => l.includes('sim_event ignoré (rôle dashboard)'))).toBe(true);
    expect(logs.some((l) => l.includes('illisible'))).toBe(true);
    expect(logs.some((l) => l.includes('phase ignoré (rôle sim)'))).toBe(true);

    await sim.close();
    await dash.close();
  });

  it('broadcasts to every client, sends commands to the sim only, and reports when no sim is connected', async () => {
    const sim = await connect(port);
    const dash = await connect(port);
    sim.send({ type: 'hello', role: 'sim' });
    dash.send({ type: 'hello', role: 'dashboard' });
    await sim.next();
    await dash.next();

    const seen: unknown[] = [];
    hub.onBroadcast((m) => seen.push(m));
    hub.broadcast({ type: 'phase', phase: 'detected', reason: 'test' });
    expect(await sim.next()).toEqual({ type: 'phase', phase: 'detected', reason: 'test' });
    expect(await dash.next()).toEqual({ type: 'phase', phase: 'detected', reason: 'test' });
    expect(seen).toHaveLength(1);

    expect(hub.sendToSim({ type: 'render_views', requestId: 'r1', cameras: ['top'] })).toBe(true);
    expect(await sim.next()).toEqual({ type: 'render_views', requestId: 'r1', cameras: ['top'] });

    await sim.close();
    await tick();
    expect(hub.simConnected()).toBe(false);
    expect(hub.sendToSim({ type: 'render_views', requestId: 'r2', cameras: ['top'] })).toBe(false);
    await dash.close();
  });

  it('replaces the previous sim client when a new one says hello', async () => {
    const first = await connect(port);
    first.send({ type: 'hello', role: 'sim' });
    await first.next();
    const closed = new Promise<void>((resolve) => first.ws.once('close', () => resolve()));
    const second = await connect(port);
    second.send({ type: 'hello', role: 'sim' });
    await second.next();
    await closed;
    expect(hub.simConnected()).toBe(true);
    const received: SimToServer[] = [];
    hub.onSimMessage((m) => received.push(m));
    second.send({ type: 'state', state: createDefaultWorld(9) });
    await tick();
    expect(received[0]).toMatchObject({ type: 'state', state: { seed: 9 } });
    await second.close();
  });
});
```

- [ ] **Step 2: Vérifier l'échec**

Run: `npx vitest run packages/server/src/hub/hub.test.ts`
Expected: FAIL, module `./hub` introuvable.

- [ ] **Step 3: Écrire `hub.ts`**

`packages/server/src/hub/hub.ts` :

```ts
import { createDefaultWorld, parseMessage, type ClientRole, type ServerToDashboard, type ServerToSim, type SimToServer } from '@tomato/shared';
import { WebSocket, WebSocketServer } from 'ws';
import { silentLogger, type Logger } from '../log';

export type Snapshot = Extract<ServerToDashboard, { type: 'snapshot' }>;

export interface Hub {
  onSimMessage(fn: (m: SimToServer) => void): () => void;
  /** false si aucun client sim n'est connecté. */
  sendToSim(m: ServerToSim): boolean;
  /** Vers TOUS les clients connectés (la page sim est aussi le dashboard). */
  broadcast(m: ServerToDashboard): void;
  simConnected(): boolean;
  close(): Promise<void>;
  /** Observe tout ce qui est diffusé (journal des épisodes). */
  onBroadcast(fn: (m: ServerToDashboard) => void): () => void;
  /** Fournit le `snapshot` envoyé à chaque client après son `hello`. */
  setSnapshot(fn: () => Snapshot): void;
  /** Port réellement lié (0 = éphémère dans les tests). */
  whenListening(): Promise<number>;
}

export interface HubOptions {
  host?: string;
  log?: Logger;
}

/** Types de messages acceptés du client sim, après son hello. */
const SIM_MESSAGE_TYPES: ReadonlySet<string> = new Set(['state', 'sim_event', 'action_result', 'views_result']);

export function createHub(port: number, opts: HubOptions = {}): Hub {
  const log = opts.log ?? silentLogger;
  const wss = new WebSocketServer({ port, host: opts.host ?? '127.0.0.1' });
  const listening = new Promise<number>((resolve, reject) => {
    wss.once('listening', () => {
      const a = wss.address();
      resolve(typeof a === 'object' && a !== null ? a.port : port);
    });
    wss.once('error', reject);
  });
  const roles = new Map<WebSocket, ClientRole>();
  let sim: WebSocket | null = null;
  const simListeners = new Set<(m: SimToServer) => void>();
  const broadcastListeners = new Set<(m: ServerToDashboard) => void>();
  let snapshot: () => Snapshot = () => ({ type: 'snapshot', state: createDefaultWorld(0), phase: 'idle', episodeId: null });

  const sendJson = (socket: WebSocket, m: ServerToSim | ServerToDashboard): boolean => {
    if (socket.readyState !== WebSocket.OPEN) return false;
    socket.send(JSON.stringify(m));
    return true;
  };

  const onHello = (socket: WebSocket, role: ClientRole): void => {
    roles.set(socket, role);
    if (role === 'sim') {
      if (sim !== null && sim !== socket) {
        log('hub: nouveau client sim, l\'ancien est remplacé');
        sim.close();
      }
      sim = socket;
    }
    sendJson(socket, snapshot());
  };

  wss.on('connection', (socket) => {
    socket.on('message', (data) => {
      const m = parseMessage(String(data));
      if (m === null) {
        log('hub: message illisible ignoré');
        return;
      }
      if (m.type === 'hello') {
        onHello(socket, m.role);
        return;
      }
      if (socket === sim && SIM_MESSAGE_TYPES.has(m.type)) {
        for (const fn of simListeners) fn(m as SimToServer);
        return;
      }
      log(`hub: message ${m.type} ignoré (rôle ${roles.get(socket) ?? 'inconnu'})`);
    });
    socket.on('close', () => {
      roles.delete(socket);
      if (sim === socket) sim = null;
    });
    socket.on('error', (e) => log(`hub: erreur socket (${e.message})`));
  });

  return {
    onSimMessage(fn) {
      simListeners.add(fn);
      return () => simListeners.delete(fn);
    },
    sendToSim: (m) => (sim !== null ? sendJson(sim, m) : false),
    broadcast(m) {
      for (const client of wss.clients) sendJson(client, m);
      for (const fn of broadcastListeners) fn(m);
    },
    simConnected: () => sim !== null && sim.readyState === WebSocket.OPEN,
    async close() {
      for (const client of wss.clients) client.terminate();
      await new Promise<void>((resolve) => wss.close(() => resolve()));
    },
    onBroadcast(fn) {
      broadcastListeners.add(fn);
      return () => broadcastListeners.delete(fn);
    },
    setSnapshot(fn) {
      snapshot = fn;
    },
    whenListening: () => listening,
  };
}
```

- [ ] **Step 4: Vérifier le succès**

Run: `npx vitest run packages/server/src/hub/hub.test.ts`
Expected: PASS, 3 tests (un vrai serveur `ws` sur un port éphémère).

- [ ] **Step 5: Commit**

```bash
git add packages/server/src/hub/hub.ts packages/server/src/hub/hub.test.ts
git commit -m "feat(server): hub WebSocket (hello, snapshot, un client sim, diffusion à tous)"
```

---

### Task 6: Pont vers la sim et faux composants de test

**Files:**
- Create: `packages/server/src/sim/viewsFallback.ts`, `packages/server/src/sim/simBridge.ts`, `packages/server/src/sim/simBridge.test.ts`, `packages/server/src/testing/fakes.ts`

**Interfaces:**
- Produces: `viewsPayloadOf(state): ViewsPayload`, `emptyViews(state): ViewsResult` ; `interface SimBridge { apply(action): Promise<ActionResult>; renderViews(cameras): Promise<ViewsResult>; latestState(): WorldState | null; onEvent(fn): () => void }`, `SIM_TIMEOUT_MS = 15_000`, `SIM_UNAVAILABLE = 'simulation did not answer'`, `createSimBridge(hub, { timeoutMs?, log?, newId? })` ; pour les tests : `createFakeHub(): FakeHub` (`sent`, `broadcasts`, `connected`, `emitSim`), `createFakeSim(initial?, reduce?): FakeSim` (`applied`, `state`, `views`, `emit`), `createMemoryJournal(): MemoryJournal` (`records`).
- Corrélation par `requestId` (`crypto.randomUUID()` par défaut) ; sans client sim ou à l'expiration du délai : `apply` → `fail(latestState ?? createDefaultWorld(0), 'not_available', 'simulation did not answer')` ; `renderViews` → `{ images: [], json }` (le contrat ne prévoit pas d'erreur pour `ViewsResult` ; « aucune image » est le signal, transformé en texte `not_available` par l'outil). Le dernier `state` reçu (et l'état de chaque `action_result`) est mémorisé.

- [ ] **Step 1: Test (échoue)**

`packages/server/src/sim/simBridge.test.ts` :

```ts
import { createDefaultWorld, ok, type SimEvent } from '@tomato/shared';
import { describe, expect, it } from 'vitest';
import { createFakeHub } from '../testing/fakes';
import { SIM_UNAVAILABLE, createSimBridge } from './simBridge';

describe('simBridge', () => {
  it('correlates action results by requestId and remembers the latest state', async () => {
    const hub = createFakeHub();
    let n = 0;
    const bridge = createSimBridge(hub, { newId: () => `req-${++n}` });
    expect(bridge.latestState()).toBeNull();

    const p1 = bridge.apply({ type: 'open_scissors' });
    const p2 = bridge.apply({ type: 'cut' });
    expect(hub.sent).toEqual([
      { type: 'apply_action', requestId: 'req-1', action: { type: 'open_scissors' } },
      { type: 'apply_action', requestId: 'req-2', action: { type: 'cut' } },
    ]);
    const w2 = { ...createDefaultWorld(2), simTimeS: 2 };
    const w1 = { ...createDefaultWorld(1), simTimeS: 1 };
    hub.emitSim({ type: 'action_result', requestId: 'req-2', result: ok(w2, 'stem_cut') });
    hub.emitSim({ type: 'action_result', requestId: 'req-1', result: ok(w1, 'opened') });
    expect((await p2).message).toBe('stem_cut');
    expect((await p1).message).toBe('opened');
    expect(bridge.latestState()?.simTimeS).toBe(1);

    hub.emitSim({ type: 'state', state: { ...w1, simTimeS: 5 } });
    expect(bridge.latestState()?.simTimeS).toBe(5);
  });

  it('answers views_result and falls back to an empty result without images', async () => {
    const hub = createFakeHub();
    const bridge = createSimBridge(hub, { newId: () => 'v1' });
    const p = bridge.renderViews(['front']);
    expect(hub.sent[0]).toEqual({ type: 'render_views', requestId: 'v1', cameras: ['front'] });
    const json = { ...createDefaultWorld(0), simTimeS: 3 };
    hub.emitSim({
      type: 'views_result',
      requestId: 'v1',
      result: { images: [{ camera: 'front', pngBase64: 'iVBOR', widthPx: 800, heightPx: 800 }], json: { ...json, tomatoes: [] } },
    });
    expect((await p).images).toHaveLength(1);

    hub.connected = false;
    const r = await bridge.renderViews(['top']);
    expect(r.images).toEqual([]);
    expect(r.json.phase).toBe('idle');
  });

  it('fails with not_available immediately without sim and after the timeout', async () => {
    const hub = createFakeHub();
    const logs: string[] = [];
    const bridge = createSimBridge(hub, { timeoutMs: 15, log: (l) => logs.push(l) });
    hub.connected = false;
    const r1 = await bridge.apply({ type: 'cut' });
    expect(r1.ok).toBe(false);
    if (r1.ok) throw new Error('unreachable');
    expect(r1.error).toBe('not_available');
    expect(r1.message).toBe(SIM_UNAVAILABLE);
    expect(hub.sent).toEqual([]);

    hub.connected = true;
    const r2 = await bridge.apply({ type: 'cut' });
    expect(r2.ok).toBe(false);
    expect(hub.sent).toHaveLength(1);
    expect(logs.some((l) => l.includes('délai dépassé'))).toBe(true);
    hub.emitSim({ type: 'action_result', requestId: 'late', result: ok(createDefaultWorld(0), 'late') });
    expect(logs.some((l) => l.includes('sans requête en attente'))).toBe(true);
  });

  it('relays sim events to listeners until unsubscribed', () => {
    const hub = createFakeHub();
    const bridge = createSimBridge(hub);
    const seen: SimEvent[] = [];
    const off = bridge.onEvent((e) => seen.push(e));
    hub.emitSim({ type: 'sim_event', event: { type: 'plant_regenerated', seed: 1 } });
    off();
    hub.emitSim({ type: 'sim_event', event: { type: 'plant_regenerated', seed: 2 } });
    expect(seen).toEqual([{ type: 'plant_regenerated', seed: 1 }]);
  });
});
```

- [ ] **Step 2: Vérifier l'échec**

Run: `npx vitest run packages/server/src/sim/simBridge.test.ts`
Expected: FAIL, modules `../testing/fakes` et `./simBridge` introuvables.

- [ ] **Step 3: Écrire `viewsFallback.ts`**

`packages/server/src/sim/viewsFallback.ts` :

```ts
import type { ViewsPayload, ViewsResult, WorldState } from '@tomato/shared';

/** JSON des vues construit depuis un état, sans image (quand la sim ne répond pas). */
export function viewsPayloadOf(state: WorldState): ViewsPayload {
  return {
    simTimeS: state.simTimeS,
    phase: state.phase,
    targetTomatoId: state.targetTomatoId,
    tomatoes: state.tomatoes.map((t) => ({
      id: t.id, state: t.state, ripeness: t.ripeness, positionCm: t.positionCm, stem: t.stem, visibleIn: t.visibleIn,
    })),
    scissors: state.scissors,
    basket: state.basket,
    cameras: state.cameras,
    limits: state.limits,
  };
}

/** Résultat de vues « vide » : aucune image, JSON de l'état connu. */
export const emptyViews = (state: WorldState): ViewsResult => ({ images: [], json: viewsPayloadOf(state) });
```

- [ ] **Step 4: Écrire `simBridge.ts`**

`packages/server/src/sim/simBridge.ts` :

```ts
import { randomUUID } from 'node:crypto';
import { createDefaultWorld, fail, type ActionResult, type CameraId, type SimAction, type SimEvent, type ViewsResult, type WorldState } from '@tomato/shared';
import type { Hub } from '../hub/hub';
import { silentLogger, type Logger } from '../log';
import { emptyViews } from './viewsFallback';

export interface SimBridge {
  apply(action: SimAction): Promise<ActionResult>;
  /** Sans réponse de la sim : `images` vide et JSON du dernier état connu. */
  renderViews(cameras: CameraId[]): Promise<ViewsResult>;
  latestState(): WorldState | null;
  onEvent(fn: (e: SimEvent) => void): () => void;
}

export interface SimBridgeOptions {
  timeoutMs?: number;
  log?: Logger;
  newId?: () => string;
}

export const SIM_TIMEOUT_MS = 15_000;
export const SIM_UNAVAILABLE = 'simulation did not answer';

type Pending =
  | { kind: 'action_result'; resolve: (r: ActionResult) => void; timer: ReturnType<typeof setTimeout> }
  | { kind: 'views_result'; resolve: (r: ViewsResult) => void; timer: ReturnType<typeof setTimeout> };

export function createSimBridge(hub: Hub, opts: SimBridgeOptions = {}): SimBridge {
  const timeoutMs = opts.timeoutMs ?? SIM_TIMEOUT_MS;
  const log = opts.log ?? silentLogger;
  const newId = opts.newId ?? randomUUID;
  const pending = new Map<string, Pending>();
  const eventListeners = new Set<(e: SimEvent) => void>();
  let latest: WorldState | null = null;

  const known = (): WorldState => latest ?? createDefaultWorld(0);

  hub.onSimMessage((m) => {
    switch (m.type) {
      case 'state':
        latest = m.state;
        return;
      case 'sim_event':
        for (const fn of eventListeners) fn(m.event);
        return;
      case 'action_result':
      case 'views_result': {
        const p = pending.get(m.requestId);
        if (!p) {
          log(`simBridge: réponse ${m.type} sans requête en attente (${m.requestId})`);
          return;
        }
        pending.delete(m.requestId);
        clearTimeout(p.timer);
        if (p.kind === 'action_result' && m.type === 'action_result') {
          latest = m.result.state;
          p.resolve(m.result);
        } else if (p.kind === 'views_result' && m.type === 'views_result') {
          p.resolve(m.result);
        } else {
          log(`simBridge: réponse ${m.type} inattendue pour une requête ${p.kind}`);
        }
        return;
      }
      case 'hello':
        return;
    }
  });

  function request<T>(kind: Pending['kind'], build: (requestId: string) => Parameters<Hub['sendToSim']>[0], onFail: () => T, wrap: (resolve: (r: T) => void, timer: ReturnType<typeof setTimeout>) => Pending): Promise<T> {
    if (!hub.simConnected()) return Promise.resolve(onFail());
    return new Promise<T>((resolve) => {
      const requestId = newId();
      const timer = setTimeout(() => {
        pending.delete(requestId);
        log(`simBridge: délai dépassé pour ${kind} (${requestId})`);
        resolve(onFail());
      }, timeoutMs);
      pending.set(requestId, wrap(resolve, timer));
      if (!hub.sendToSim(build(requestId))) {
        clearTimeout(timer);
        pending.delete(requestId);
        resolve(onFail());
      }
    });
  }

  return {
    apply: (action) =>
      request<ActionResult>(
        'action_result',
        (requestId) => ({ type: 'apply_action', requestId, action }),
        () => fail(known(), 'not_available', SIM_UNAVAILABLE),
        (resolve, timer) => ({ kind: 'action_result', resolve, timer }),
      ),
    renderViews: (cameras) =>
      request<ViewsResult>(
        'views_result',
        (requestId) => ({ type: 'render_views', requestId, cameras }),
        () => emptyViews(known()),
        (resolve, timer) => ({ kind: 'views_result', resolve, timer }),
      ),
    latestState: () => latest,
    onEvent(fn) {
      eventListeners.add(fn);
      return () => eventListeners.delete(fn);
    },
  };
}
```

- [ ] **Step 5: Écrire `testing/fakes.ts`**

`packages/server/src/testing/fakes.ts` :

```ts
import { createDefaultWorld, ok, type ActionResult, type CameraId, type ServerToDashboard, type ServerToSim, type SimAction, type SimEvent, type SimToServer, type ViewsResult, type WorldState } from '@tomato/shared';
import type { EpisodeJournal, EpisodeRecord } from '../episodes/journal';
import type { Hub, Snapshot } from '../hub/hub';
import type { SimBridge } from '../sim/simBridge';
import { emptyViews } from '../sim/viewsFallback';

/** Hub en mémoire : enregistre ce qui est envoyé et diffusé, laisse le test injecter des messages sim. */
export interface FakeHub extends Hub {
  sent: ServerToSim[];
  broadcasts: ServerToDashboard[];
  connected: boolean;
  emitSim(m: SimToServer): void;
  snapshot(): Snapshot;
}

export function createFakeHub(): FakeHub {
  const simListeners = new Set<(m: SimToServer) => void>();
  const broadcastListeners = new Set<(m: ServerToDashboard) => void>();
  let snapshot: () => Snapshot = () => ({ type: 'snapshot', state: createDefaultWorld(0), phase: 'idle', episodeId: null });
  const hub: FakeHub = {
    sent: [],
    broadcasts: [],
    connected: true,
    emitSim: (m) => {
      for (const fn of simListeners) fn(m);
    },
    snapshot: () => snapshot(),
    onSimMessage(fn) {
      simListeners.add(fn);
      return () => simListeners.delete(fn);
    },
    sendToSim(m) {
      if (!hub.connected) return false;
      hub.sent.push(m);
      return true;
    },
    broadcast(m) {
      hub.broadcasts.push(m);
      for (const fn of broadcastListeners) fn(m);
    },
    simConnected: () => hub.connected,
    close: () => Promise.resolve(),
    onBroadcast(fn) {
      broadcastListeners.add(fn);
      return () => broadcastListeners.delete(fn);
    },
    setSnapshot(fn) {
      snapshot = fn;
    },
    whenListening: () => Promise.resolve(0),
  };
  return hub;
}

/** Pont sim en mémoire : applique un réducteur scripté, expose les actions reçues. */
export interface FakeSim extends SimBridge {
  applied: SimAction[];
  state: WorldState;
  /** Réponse de renderViews ; null = aucune image (sim absente). */
  views: ((cameras: CameraId[]) => ViewsResult) | null;
  emit(e: SimEvent): void;
}

export function createFakeSim(initial: WorldState = createDefaultWorld(1), reduce?: (s: WorldState, a: SimAction) => ActionResult): FakeSim {
  const listeners = new Set<(e: SimEvent) => void>();
  const sim: FakeSim = {
    applied: [],
    state: initial,
    views: null,
    emit: (e) => {
      for (const fn of listeners) fn(e);
    },
    apply(action) {
      sim.applied.push(action);
      const r = reduce ? reduce(sim.state, action) : ok(sim.state, `${action.type} ok`);
      sim.state = r.state;
      return Promise.resolve(r);
    },
    renderViews: (cameras) => Promise.resolve(sim.views ? sim.views(cameras) : emptyViews(sim.state)),
    latestState: () => sim.state,
    onEvent(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
  };
  return sim;
}

/** Journal en mémoire (pas de disque). */
export interface MemoryJournal extends EpisodeJournal {
  records: EpisodeRecord[];
}

export function createMemoryJournal(): MemoryJournal {
  let open: EpisodeRecord | null = null;
  const journal: MemoryJournal = {
    records: [],
    open(episodeId, tomatoId) {
      open = { episodeId, tomatoId, startedAt: new Date(0).toISOString(), endedAt: null, outcome: null, note: '', messages: [], toolCalls: 0, costUsd: 0 };
    },
    record(message) {
      open?.messages.push({ atMs: 0, message });
    },
    close(outcome, note, toolCalls) {
      if (open) journal.records.push({ ...open, outcome, note, toolCalls, endedAt: new Date(0).toISOString() });
      open = null;
      return Promise.resolve();
    },
    current: () => open?.episodeId ?? null,
    list: () => Promise.resolve(journal.records.map((r) => ({ episodeId: r.episodeId, startedAt: r.startedAt, outcome: r.outcome, tomatoId: r.tomatoId }))),
    read: (id) => Promise.resolve(journal.records.find((r) => r.episodeId === id) ?? null),
    flush: () => Promise.resolve(),
  };
  return journal;
}
```

- [ ] **Step 6: Vérifier le succès**

Run: `npx vitest run packages/server/src/sim/simBridge.test.ts`
Expected: PASS, 4 tests.

- [ ] **Step 7: Commit**

```bash
git add packages/server/src/sim packages/server/src/testing/fakes.ts
git commit -m "feat(server): pont vers la sim corrélé par requestId, délai 15 s, dernier état ; faux hub/sim/journal de test"
```

---

### Task 7: Session, phases et file d'attente

**Files:**
- Create: `packages/server/src/state/session.ts`, `packages/server/src/state/session.test.ts`

**Interfaces:**
- Consumes: `transition` de `@tomato/shared`, `Hub`, `SimBridge`, `EpisodeJournal`, règles de la Task 3.
- Produces: `interface SessionState { phase; episodeId; targetTomatoId; lastEvent; harvested; missed; toolCallsThisEpisode }`, `interface WakeEvent { tomatoId: number; positionCm: Vec3; ripeness: number }`, `interface Session { get(); setPhase(to, reason): boolean; startEpisode(tomatoId): string | null; endEpisode(outcome, note): void; onPhase(fn): () => void; handleSimEvent(event): void; noteToolCall(tool): number; noteToolResult(tool, ok): void; onWake(fn): () => void; pendingDetections(): readonly number[] }`, `episodeIdFor(nowMs, tomatoId)`, `createSession(hub, { sim, journal, now?, log? })`.
- Chaque changement de phase passe par `transition` de shared (erreur = journalisée, ignorée, `false`) et diffuse `phase` puis `block_activity`. `ripe_detected` en `idle` → `startEpisode` (journal ouvert, `detected`, `set_target` envoyé à la sim, réveil via `onWake`) ; hors `idle` → file d'attente (sans doublon, ni la cible courante), rejouée dans `endEpisode` ; `plant_regenerated` vide la file. `endEpisode` pendant `falling` est différé jusqu'à `tomato_landed`. `noteToolCall` compte seulement pendant un épisode (mode manuel : 0, pas de limite).

- [ ] **Step 1: Test (échoue)**

`packages/server/src/state/session.test.ts` :

```ts
import { createDefaultWorld, type Phase, type Tomato } from '@tomato/shared';
import { describe, expect, it } from 'vitest';
import { createFakeHub, createFakeSim, createMemoryJournal, type FakeHub, type FakeSim, type MemoryJournal } from '../testing/fakes';
import { createSession, episodeIdFor, type Session, type WakeEvent } from './session';

const tomato = (id: number): Tomato => ({
  id, state: 'ripe', ripeness: 1, positionCm: [10 * id, 0, 60], radiusCm: 3,
  stem: { fromCm: [10 * id, 0, 66], toCm: [10 * id, 0, 63] }, attached: true, visibleIn: { top: 1, front: 1, side: 1 },
});

function setup(): { hub: FakeHub; sim: FakeSim; journal: MemoryJournal; session: Session; phases: Phase[]; wakes: WakeEvent[]; logs: string[] } {
  const hub = createFakeHub();
  const sim = createFakeSim({ ...createDefaultWorld(1), tomatoes: [tomato(1), tomato(2)] });
  const journal = createMemoryJournal();
  const logs: string[] = [];
  const session = createSession(hub, { sim, journal, now: () => Date.UTC(2026, 8, 17, 10, 22, 33, 512), log: (l) => logs.push(l) });
  const phases: Phase[] = [];
  const wakes: WakeEvent[] = [];
  session.onPhase((p) => phases.push(p));
  session.onWake((w) => wakes.push(w));
  return { hub, sim, journal, session, phases, wakes, logs };
}

describe('episodeIdFor', () => {
  it('is a filename-safe timestamp plus the tomato id', () => {
    expect(episodeIdFor(Date.UTC(2026, 8, 17, 10, 22, 33, 512), 3)).toBe('2026-09-17T10-22-33-512Z-t3');
  });
});

describe('session', () => {
  it('ripe_detected while idle opens an episode: detected, set_target, wake, journal, broadcasts', () => {
    const { hub, sim, journal, session, wakes } = setup();
    session.handleSimEvent({ type: 'ripe_detected', tomatoId: 2, detector: 'hsv', confidence: 0.9 });
    const s = session.get();
    expect(s.phase).toBe('detected');
    expect(s.episodeId).toBe('2026-09-17T10-22-33-512Z-t2');
    expect(s.targetTomatoId).toBe(2);
    expect(s.lastEvent?.type).toBe('ripe_detected');
    expect(sim.applied).toEqual([{ type: 'set_target', tomatoId: 2 }]);
    expect(wakes).toEqual([{ tomatoId: 2, positionCm: [20, 0, 60], ripeness: 1 }]);
    expect(journal.current()).toBe(s.episodeId);
    expect(hub.broadcasts.map((m) => m.type)).toEqual(['sim_event', 'block_activity', 'phase', 'block_activity']);
    expect(hub.broadcasts[1]).toMatchObject({ from: 'perception', to: 'server' });
    expect(hub.broadcasts[2]).toEqual({ type: 'phase', phase: 'detected', reason: 'tomate 2 mûre' });
  });

  it('follows the nominal path through tool results and landing, then report closes to idle', () => {
    const { sim, journal, session, phases } = setup();
    session.handleSimEvent({ type: 'ripe_detected', tomatoId: 1, detector: 'yolo', confidence: 0.8 });
    expect(session.noteToolCall('get_views')).toBe(1);
    session.noteToolResult('get_views', true);
    expect(session.get().phase).toBe('detected');
    session.noteToolResult('move_basket', true);
    expect(session.get().phase).toBe('harvesting');
    session.noteToolResult('cut', false);
    expect(session.get().phase).toBe('harvesting');
    session.noteToolResult('cut', true);
    expect(session.get().phase).toBe('falling');
    session.handleSimEvent({ type: 'tomato_landed', tomatoId: 1, inBasket: true });
    expect(session.get().phase).toBe('harvested');
    expect(session.get().harvested).toBe(1);
    session.endEpisode('harvested', 'coupe nette');
    expect(session.get()).toMatchObject({ phase: 'idle', episodeId: null, targetTomatoId: null, toolCallsThisEpisode: 0 });
    expect(phases).toEqual(['detected', 'harvesting', 'cutting', 'falling', 'harvested', 'idle']);
    expect(journal.records).toHaveLength(1);
    expect(journal.records[0]).toMatchObject({ outcome: 'harvested', note: 'coupe nette', toolCalls: 1 });
    expect(sim.applied.at(-1)).toEqual({ type: 'set_target', tomatoId: null });
  });

  it('records missed, derives the real outcome from the phase, and aborts unfinished episodes', () => {
    const { session, journal, phases } = setup();
    session.handleSimEvent({ type: 'ripe_detected', tomatoId: 1, detector: 'hsv', confidence: 1 });
    session.noteToolResult('cut', true);
    session.handleSimEvent({ type: 'tomato_landed', tomatoId: 1, inBasket: false });
    expect(session.get().phase).toBe('missed');
    session.endEpisode('harvested', 'je crois que oui');
    expect(journal.records[0]).toMatchObject({ outcome: 'missed', note: '(déclaré harvested) je crois que oui' });
    expect(session.get().missed).toBe(1);

    session.handleSimEvent({ type: 'ripe_detected', tomatoId: 2, detector: 'hsv', confidence: 1 });
    session.noteToolResult('move_scissors', true);
    session.endEpisode('aborted', 'hors de portée');
    expect(journal.records[1]).toMatchObject({ outcome: 'aborted', note: 'hors de portée' });
    expect(phases.slice(-3)).toEqual(['harvesting', 'aborted', 'idle']);
  });

  it('queues detections outside idle and replays them at the end of the episode; new_plant clears the queue', () => {
    const { session, logs } = setup();
    session.handleSimEvent({ type: 'ripe_detected', tomatoId: 1, detector: 'hsv', confidence: 1 });
    session.handleSimEvent({ type: 'ripe_detected', tomatoId: 2, detector: 'hsv', confidence: 1 });
    session.handleSimEvent({ type: 'ripe_detected', tomatoId: 2, detector: 'hsv', confidence: 1 });
    session.handleSimEvent({ type: 'ripe_detected', tomatoId: 1, detector: 'hsv', confidence: 1 });
    expect(session.pendingDetections()).toEqual([2]);
    expect(logs.some((l) => l.includes('tomate 2 mise en attente'))).toBe(true);
    session.endEpisode('aborted', '');
    expect(session.get()).toMatchObject({ phase: 'detected', targetTomatoId: 2 });
    expect(session.pendingDetections()).toEqual([]);

    session.handleSimEvent({ type: 'ripe_detected', tomatoId: 1, detector: 'hsv', confidence: 1 });
    session.handleSimEvent({ type: 'plant_regenerated', seed: 5 });
    expect(session.pendingDetections()).toEqual([]);
  });

  it('never throws on invalid transitions, ignores landing outside falling, defers closing while falling', () => {
    const { session, logs } = setup();
    expect(session.setPhase('cutting', 'saut')).toBe(false);
    expect(logs.at(-1)).toContain('transition refusée idle → cutting');
    expect(session.startEpisode(1)).not.toBeNull();
    expect(session.startEpisode(2)).toBeNull();
    session.handleSimEvent({ type: 'tomato_landed', tomatoId: 1, inBasket: true });
    expect(session.get().phase).toBe('detected');
    session.noteToolResult('cut', true);
    session.endEpisode('aborted', 'agent parti pendant la chute');
    expect(session.get().phase).toBe('falling');
    session.handleSimEvent({ type: 'tomato_landed', tomatoId: 1, inBasket: true });
    expect(session.get().phase).toBe('idle');
    expect(session.get().harvested).toBe(1);
    session.endEpisode('aborted', 'rien à clore');
    expect(logs.at(-1)).toContain('aucun épisode');
    expect(session.noteToolCall('cut')).toBe(0);
  });
});
```

- [ ] **Step 2: Vérifier l'échec**

Run: `npx vitest run packages/server/src/state/session.test.ts`
Expected: FAIL, module `./session` introuvable.

- [ ] **Step 3: Écrire `session.ts`**

`packages/server/src/state/session.ts` :

```ts
import { transition, type Phase, type SimEvent, type ToolName, type Vec3 } from '@tomato/shared';
import type { EpisodeJournal } from '../episodes/journal';
import type { Hub } from '../hub/hub';
import { silentLogger, type Logger } from '../log';
import type { SimBridge } from '../sim/simBridge';
import { outcomeForPhase, phaseAfterLanding, phasesAfterToolResult, phasesToClose, type EpisodeOutcome } from './rules';

export interface SessionState {
  phase: Phase;
  episodeId: string | null;
  targetTomatoId: number | null;
  lastEvent: SimEvent | null;
  harvested: number;
  missed: number;
  toolCallsThisEpisode: number;
}

/** Réveil de l'agent (M6) : la tomate mûre à récolter. */
export interface WakeEvent {
  tomatoId: number;
  positionCm: Vec3;
  ripeness: number;
}

export interface Session {
  get(): SessionState;
  /** Via `transition` de shared ; transition invalide = journalisée, ignorée, false. */
  setPhase(to: Phase, reason: string): boolean;
  /** Ouvre un épisode (idle seulement) : journal, `detected`, `set_target`, réveil. Renvoie l'episodeId ou null. */
  startEpisode(tomatoId: number): string | null;
  /** Clôt l'épisode (l'issue réelle vient de la phase) puis rejoue une détection en attente. */
  endEpisode(outcome: EpisodeOutcome, note: string): void;
  onPhase(fn: (phase: Phase, reason: string) => void): () => void;
  /** Événements de la sim : diffusion, règles de phase, file d'attente des `ripe_detected`. */
  handleSimEvent(event: SimEvent): void;
  /** Incrémente le compteur d'appels de l'épisode et le renvoie (0 hors épisode). */
  noteToolCall(tool: ToolName): number;
  /** Applique les règles de phase liées au résultat d'un outil. */
  noteToolResult(tool: ToolName, ok: boolean): void;
  onWake(fn: (event: WakeEvent) => void): () => void;
  /** Tomates détectées mûres pendant un épisode, à traiter au retour en idle. */
  pendingDetections(): readonly number[];
}

export interface SessionDeps {
  sim: SimBridge;
  journal: EpisodeJournal;
  now?: () => number;
  log?: Logger;
}

/** `2026-09-17T10-22-33-512Z-t3` : horodatage sûr pour un nom de fichier + tomate. */
export function episodeIdFor(nowMs: number, tomatoId: number): string {
  return `${new Date(nowMs).toISOString().replace(/[:.]/g, '-')}-t${tomatoId}`;
}

export function createSession(hub: Hub, deps: SessionDeps): Session {
  const now = deps.now ?? Date.now;
  const log = deps.log ?? silentLogger;
  const state: SessionState = { phase: 'idle', episodeId: null, targetTomatoId: null, lastEvent: null, harvested: 0, missed: 0, toolCallsThisEpisode: 0 };
  const queue: number[] = [];
  const phaseListeners = new Set<(phase: Phase, reason: string) => void>();
  const wakeListeners = new Set<(event: WakeEvent) => void>();
  let pendingClose: { outcome: EpisodeOutcome; note: string } | null = null;

  function setPhase(to: Phase, reason: string): boolean {
    let next: Phase;
    try {
      next = transition(state.phase, to);
    } catch {
      log(`session: transition refusée ${state.phase} → ${to} (${reason})`);
      return false;
    }
    state.phase = next;
    if (next === 'harvested') state.harvested += 1;
    if (next === 'missed') state.missed += 1;
    hub.broadcast({ type: 'phase', phase: next, reason });
    hub.broadcast({ type: 'block_activity', from: 'server', to: 'dashboard', label: `phase ${next}` });
    for (const fn of phaseListeners) fn(next, reason);
    return true;
  }

  function wakeEventFor(tomatoId: number): WakeEvent {
    const t = deps.sim.latestState()?.tomatoes.find((x) => x.id === tomatoId);
    return { tomatoId, positionCm: t?.positionCm ?? [0, 0, 0], ripeness: t?.ripeness ?? 1 };
  }

  function startEpisode(tomatoId: number): string | null {
    if (state.phase !== 'idle') {
      log(`session: startEpisode ignoré en phase ${state.phase}`);
      return null;
    }
    const episodeId = episodeIdFor(now(), tomatoId);
    state.episodeId = episodeId;
    state.targetTomatoId = tomatoId;
    state.toolCallsThisEpisode = 0;
    deps.journal.open(episodeId, tomatoId);
    setPhase('detected', `tomate ${tomatoId} mûre`);
    void deps.sim.apply({ type: 'set_target', tomatoId });
    const event = wakeEventFor(tomatoId);
    for (const fn of wakeListeners) fn(event);
    return episodeId;
  }

  function endEpisode(outcome: EpisodeOutcome, note: string): void {
    if (state.episodeId === null) {
      log('session: aucun épisode à clore');
      return;
    }
    const steps = phasesToClose(state.phase);
    if (steps === null) {
      pendingClose = { outcome, note };
      log(`session: clôture différée en phase ${state.phase}`);
      return;
    }
    const actual = outcomeForPhase(state.phase);
    const fullNote = actual === outcome ? note : `(déclaré ${outcome}) ${note}`;
    const toolCalls = state.toolCallsThisEpisode;
    for (const p of steps) setPhase(p, `épisode clos : ${actual}`);
    void deps.journal.close(actual, fullNote, toolCalls);
    state.episodeId = null;
    state.targetTomatoId = null;
    state.toolCallsThisEpisode = 0;
    pendingClose = null;
    void deps.sim.apply({ type: 'set_target', tomatoId: null });
    const next = queue.shift();
    if (next !== undefined) startEpisode(next);
  }

  function handleSimEvent(event: SimEvent): void {
    state.lastEvent = event;
    hub.broadcast({ type: 'sim_event', event });
    hub.broadcast({ type: 'block_activity', from: event.type === 'ripe_detected' ? 'perception' : 'simulation', to: 'server', label: event.type });
    switch (event.type) {
      case 'ripe_detected':
        if (state.phase === 'idle') startEpisode(event.tomatoId);
        else if (event.tomatoId !== state.targetTomatoId && !queue.includes(event.tomatoId)) {
          queue.push(event.tomatoId);
          log(`session: tomate ${event.tomatoId} mise en attente (phase ${state.phase})`);
        }
        return;
      case 'tomato_landed': {
        const p = phaseAfterLanding(state.phase, event.inBasket);
        if (p === null) {
          log(`session: tomato_landed ignoré en phase ${state.phase}`);
          return;
        }
        setPhase(p, `tomate ${event.tomatoId} ${event.inBasket ? 'dans le panier' : 'hors du panier'}`);
        if (pendingClose) endEpisode(pendingClose.outcome, pendingClose.note);
        return;
      }
      case 'plant_regenerated':
        queue.length = 0;
        return;
    }
  }

  return {
    get: () => ({ ...state }),
    setPhase,
    startEpisode,
    endEpisode,
    onPhase(fn) {
      phaseListeners.add(fn);
      return () => phaseListeners.delete(fn);
    },
    handleSimEvent,
    noteToolCall() {
      if (state.episodeId === null) return 0;
      state.toolCallsThisEpisode += 1;
      return state.toolCallsThisEpisode;
    },
    noteToolResult(tool, ok) {
      for (const p of phasesAfterToolResult(state.phase, tool, ok)) setPhase(p, `${tool} ${ok ? 'ok' : 'échec'}`);
    },
    onWake(fn) {
      wakeListeners.add(fn);
      return () => wakeListeners.delete(fn);
    },
    pendingDetections: () => [...queue],
  };
}
```

- [ ] **Step 4: Vérifier le succès**

Run: `npx vitest run packages/server/src/state/session.test.ts`
Expected: PASS, 6 tests.

- [ ] **Step 5: Commit**

```bash
git add packages/server/src/state/session.ts packages/server/src/state/session.test.ts
git commit -m "feat(server): session (phases via transition, épisodes, file d'attente des détections, réveil)"
```

---

### Task 8: Formatage des résultats et résumés en français (pur)

**Files:**
- Create: `packages/server/src/mcp/format.ts`, `packages/server/src/mcp/format.test.ts`

**Interfaces:**
- Produces: `TextBlock`, `ImageBlock`, `ContentBlock`, `text(t)`, `png(image)`, `fr(n)`, `frVec(v)`, `compactJson(value)` (nombres arrondis à 2 décimales), `viewHeader(image, pose)` (« Vue front — axes X→ Z↑ — 8 px/cm »), `detailsText(details)` (« 1,4 cm, 62° »), `actionResultText(r, focus?)`, `summarizeAction(tool, r)` (« ciseaux vers X 12, Y 4, Z 38 », « coupe : misaligned, 1,4 cm, 62° », « panier à X 3, Y -2 », …).

- [ ] **Step 1: Test (échoue)**

`packages/server/src/mcp/format.test.ts` :

```ts
import { createDefaultWorld, fail, ok } from '@tomato/shared';
import { describe, expect, it } from 'vitest';
import { actionResultText, compactJson, detailsText, fr, frVec, summarizeAction, viewHeader } from './format';

const world = createDefaultWorld(1);

describe('fr / frVec / compactJson', () => {
  it('formats numbers the French way with at most one decimal', () => {
    expect(fr(12)).toBe('12');
    expect(fr(1.44)).toBe('1,4');
    expect(fr(-2.05)).toBe('-2');
    expect(frVec([12, 4.26, 38])).toBe('X 12, Y 4,3, Z 38');
    expect(compactJson({ a: 1.23456, b: [0.005, 'x'] })).toBe('{"a":1.23,"b":[0.01,"x"]}');
  });
});

describe('viewHeader and detailsText', () => {
  it('names the view, its image axes and the scale', () => {
    const image = { camera: 'front' as const, pngBase64: '', widthPx: 800, heightPx: 800 };
    expect(viewHeader(image, world.cameras.front)).toBe('Vue front — axes X→ Z↑ — 8 px/cm');
    expect(viewHeader({ ...image, camera: 'top' }, world.cameras.top)).toBe('Vue top — axes X→ Y↑ — 8 px/cm');
    expect(detailsText({ distanceCm: 1.42, angleDeg: 62, axis: 'x' })).toBe('1,4 cm, 62°, axis x');
    expect(detailsText(undefined)).toBe('');
  });
});

describe('actionResultText and summarizeAction', () => {
  it('renders ok results with an optional focused JSON', () => {
    const r = ok(world, 'stem_cut');
    expect(actionResultText(r)).toBe('ok : stem_cut');
    expect(actionResultText(r, { z: 5.005 })).toBe('ok : stem_cut\n{"z":5.01}');
  });

  it('renders failures as « code : message (détails) », never throwing', () => {
    const r = fail(world, 'misaligned', 'cut line is off the stem', { distanceCm: 1.4, angleDeg: 62 });
    expect(actionResultText(r)).toBe('misaligned : cut line is off the stem (1,4 cm, 62°)');
    expect(actionResultText(fail(world, 'out_of_reach', 'too far'))).toBe('out_of_reach : too far');
  });

  it('writes the one-line French summaries of the architecture', () => {
    const moved = { ...world, scissors: { ...world.scissors, cutPointCm: [12, 4, 38] as const } };
    expect(summarizeAction('move_scissors', ok(moved, 'moved'))).toBe('ciseaux vers X 12, Y 4, Z 38');
    expect(summarizeAction('cut', fail(world, 'misaligned', 'off', { distanceCm: 1.4, angleDeg: 62 }))).toBe('coupe : misaligned, 1,4 cm, 62°');
    expect(summarizeAction('cut', ok(world, 'stem_cut'))).toBe('coupe : stem_cut');
    expect(summarizeAction('move_basket', ok(world, 'moved'))).toBe('panier à X 0, Y 0');
    expect(summarizeAction('move_basket', fail(world, 'out_of_rail', 'x too far'))).toBe('panier : out_of_rail');
    expect(summarizeAction('open_scissors', ok({ ...world, scissors: { ...world.scissors, openingDeg: 30 } }, 'open'))).toBe('ciseaux ouverts (30°)');
    expect(summarizeAction('rotate_scissors', ok(world, 'r'))).toBe('ciseaux lacet 0, tangage 0, roulis 0');
  });
});
```

- [ ] **Step 2: Vérifier l'échec**

Run: `npx vitest run packages/server/src/mcp/format.test.ts`
Expected: FAIL, module `./format` introuvable.

- [ ] **Step 3: Écrire `format.ts`**

`packages/server/src/mcp/format.ts` :

```ts
import type { ActionResult, CameraId, CameraPose, Vec3, ViewImage } from '@tomato/shared';

export interface TextBlock {
  type: 'text';
  text: string;
}
export interface ImageBlock {
  type: 'image';
  data: string;
  mimeType: 'image/png';
}
export type ContentBlock = TextBlock | ImageBlock;

export const text = (t: string): TextBlock => ({ type: 'text', text: t });
export const png = (image: ViewImage): ImageBlock => ({ type: 'image', data: image.pngBase64, mimeType: 'image/png' });

/** Nombre en français : au plus une décimale, virgule, sans décimale inutile (12 → « 12 », 1,44 → « 1,4 »). */
export function fr(n: number): string {
  const r = Math.round(n * 10) / 10;
  return (Number.isInteger(r) ? String(r) : r.toFixed(1)).replace('.', ',');
}

export const frVec = (v: Vec3): string => `X ${fr(v[0])}, Y ${fr(v[1])}, Z ${fr(v[2])}`;

/** JSON compact : nombres arrondis à deux décimales. */
export function compactJson(value: unknown): string {
  return JSON.stringify(value, (_key: string, v: unknown) => (typeof v === 'number' ? Math.round(v * 100) / 100 : v));
}

const VIEW_AXES: Record<CameraId, string> = { top: 'X→ Y↑', front: 'X→ Z↑', side: 'Y→ Z↑' };

/** « Vue front — axes X→ Z↑ — 8 px/cm », placé avant chaque image. */
export function viewHeader(image: ViewImage, pose: CameraPose): string {
  return `Vue ${image.camera} — axes ${VIEW_AXES[image.camera]} — ${fr(pose.pxPerCm)} px/cm`;
}

/** Détails numériques d'une erreur : « 1,4 cm, 62° ». */
export function detailsText(details: Record<string, number | string> | undefined): string {
  if (!details) return '';
  return Object.entries(details)
    .map(([k, v]) => {
      if (typeof v !== 'number') return `${k} ${v}`;
      if (k.endsWith('Cm')) return `${fr(v)} cm`;
      if (k.endsWith('Deg')) return `${fr(v)}°`;
      return `${k} ${fr(v)}`;
    })
    .join(', ');
}

/** Texte d'un ActionResult pour l'agent : « ok : message » + JSON ciblé, ou « code : message (détails) ». */
export function actionResultText(r: ActionResult, focus?: unknown): string {
  if (r.ok) return focus === undefined ? `ok : ${r.message}` : `ok : ${r.message}\n${compactJson(focus)}`;
  const d = detailsText(r.details);
  return d === '' ? `${r.error} : ${r.message}` : `${r.error} : ${r.message} (${d})`;
}

/** Résumé d'une ligne en français d'un résultat d'outil de mouvement ou de coupe. */
export function summarizeAction(tool: string, r: ActionResult): string {
  const s = r.state;
  switch (tool) {
    case 'move_scissors':
      return r.ok ? `ciseaux vers ${frVec(s.scissors.cutPointCm)}` : `ciseaux : ${failText(r)}`;
    case 'rotate_scissors':
      return r.ok
        ? `ciseaux lacet ${fr(s.scissors.yawDeg)}, tangage ${fr(s.scissors.pitchDeg)}, roulis ${fr(s.scissors.rollDeg)}`
        : `rotation : ${failText(r)}`;
    case 'open_scissors':
      return r.ok ? `ciseaux ouverts (${fr(s.scissors.openingDeg)}°)` : `ouverture : ${failText(r)}`;
    case 'cut':
      return `coupe : ${r.ok ? r.message : failText(r)}`;
    case 'move_basket':
      return r.ok ? `panier à X ${fr(s.basket.centerCm[0])}, Y ${fr(s.basket.centerCm[1])}` : `panier : ${failText(r)}`;
    default:
      return r.ok ? `${tool} : ${r.message}` : `${tool} : ${failText(r)}`;
  }
}

function failText(r: ActionResult): string {
  if (r.ok) return r.message;
  const d = detailsText(r.details);
  return d === '' ? r.error : `${r.error}, ${d}`;
}
```

- [ ] **Step 4: Vérifier le succès**

Run: `npx vitest run packages/server/src/mcp/format.test.ts`
Expected: PASS, 5 tests.

- [ ] **Step 5: Commit**

```bash
git add packages/server/src/mcp/format.ts packages/server/src/mcp/format.test.ts
git commit -m "feat(server): formatage des résultats d'outils et résumés d'une ligne en français"
```

---

### Task 9: Handlers des neuf outils

**Files:**
- Create: `packages/server/src/mcp/handlers.ts`, `packages/server/src/mcp/handlers.test.ts`

**Interfaces:**
- Consumes: `ToolSchemas`, `ToolInput`, `MAX_TOOL_CALLS_PER_EPISODE`, `CAMERA_IDS` de `@tomato/shared` ; `SimBridge`, `Session`, `Hub` ; formatage de la Task 8.
- Produces: `interface ToolOutcome { ok: boolean; content: ContentBlock[]; summary: string; after?: () => void }`, `type ToolHandler = (rawArgs: unknown) => Promise<ToolOutcome>`, `interface ToolDeps { sim; session; hub }`, `NO_IMAGES_TEXT`, `FALLING_TEXT`, `createToolHandlers(deps): Record<ToolName, ToolHandler>`.
- Formats (contrat) : `get_status` → JSON compact (phase de session, épisode, cible, sim connectée, temps sim, compteur d'appels, dernier événement, tomates, poses, limites) ; `get_views` → par caméra un bloc texte d'en-tête puis un bloc image PNG, puis le JSON `ViewsPayload` (phase remplacée par celle du serveur) ; diffusion `views` ; outils de mouvement → `ok : message` + pose résultante en JSON, ou `code : message (détails)` ; `move_camera` → texte + vue rafraîchie de cette caméra ; `cut` → texte ; `report` → accusé ; la clôture réelle est faite par `after()` (exécuté par l'enveloppe après la diffusion de `tool_call_result`, pour que ce message soit encore dans le journal). Aucune exception : arguments invalides → `invalid_argument : …`.

- [ ] **Step 1: Test (échoue)**

`packages/server/src/mcp/handlers.test.ts` :

```ts
import { createDefaultWorld, fail, ok, type Tomato } from '@tomato/shared';
import { describe, expect, it } from 'vitest';
import { createSession } from '../state/session';
import { createFakeHub, createFakeSim, createMemoryJournal } from '../testing/fakes';
import { FALLING_TEXT, NO_IMAGES_TEXT, createToolHandlers } from './handlers';

const tomato: Tomato = {
  id: 1, state: 'ripe', ripeness: 1, positionCm: [10, 0, 60], radiusCm: 3,
  stem: { fromCm: [10, 0, 66], toCm: [10, 0, 63] }, attached: true, visibleIn: { top: 1, front: 1, side: 1 },
};
const PNG = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';

function setup() {
  const hub = createFakeHub();
  const sim = createFakeSim({ ...createDefaultWorld(1), tomatoes: [tomato] }, (s, a) => {
    if (a.type === 'move_scissors' && a.z > 100) return fail(s, 'out_of_reach', 'beyond arm reach', { requestedCm: a.z, maxCm: 100 });
    if (a.type === 'cut') return fail(s, 'misaligned', 'blade line is off the stem', { distanceCm: 1.42, angleDeg: 62 });
    if (a.type === 'move_scissors') return ok({ ...s, scissors: { ...s.scissors, cutPointCm: [a.x, a.y, a.z] } }, 'moved');
    return ok(s, `${a.type} ok`);
  });
  const journal = createMemoryJournal();
  const session = createSession(hub, { sim, journal });
  return { hub, sim, session, journal, handlers: createToolHandlers({ sim, session, hub }) };
}

describe('tool handlers', () => {
  it('turn invalid arguments into an invalid_argument text, never an exception', async () => {
    const { handlers } = setup();
    const r = await handlers.move_scissors({ x: 1, y: 2 });
    expect(r.ok).toBe(false);
    expect(r.content[0]).toMatchObject({ type: 'text' });
    expect((r.content[0] as { text: string }).text).toMatch(/^invalid_argument : /);
    expect((r.content[0] as { text: string }).text).toContain('mode');
    expect(r.summary).toBe('move_scissors : invalid_argument');
    const r2 = await handlers.get_views({ cameras: ['back'] });
    expect(r2.ok).toBe(false);
    expect((r2.content[0] as { text: string }).text).toContain('cameras.0');
  });

  it('get_status returns a compact JSON with the session phase, tomatoes, poses and limits', async () => {
    const { handlers, session } = setup();
    session.handleSimEvent({ type: 'ripe_detected', tomatoId: 1, detector: 'hsv', confidence: 1 });
    const r = await handlers.get_status({});
    const status = JSON.parse((r.content[0] as { text: string }).text) as Record<string, unknown>;
    expect(status).toMatchObject({ phase: 'detected', targetTomatoId: 1, simConnected: true, toolCalls: { used: 0, max: 40 } });
    expect(status.tomatoes).toEqual([{ id: 1, state: 'ripe', ripeness: 1, positionCm: [10, 0, 60], attached: true, stem: tomato.stem }]);
    expect(status).toHaveProperty('limits.scissorsReachCm', 110);
    expect(r.summary).toBe('état : detected, 1 tomates');
  });

  it('get_views returns header + image per camera then the JSON, and broadcasts views', async () => {
    const { handlers, sim, hub } = setup();
    sim.views = (cams) => ({ images: cams.map((camera) => ({ camera, pngBase64: PNG, widthPx: 800, heightPx: 800 })), json: { ...sim.state, tomatoes: [] } });
    const r = await handlers.get_views({ cameras: ['front', 'top'] });
    expect(r.ok).toBe(true);
    expect(r.content.map((b) => b.type)).toEqual(['text', 'image', 'text', 'image', 'text']);
    expect(r.content[0]).toEqual({ type: 'text', text: 'Vue front — axes X→ Z↑ — 8 px/cm' });
    expect(r.content[1]).toEqual({ type: 'image', data: PNG, mimeType: 'image/png' });
    const json = JSON.parse((r.content[4] as { text: string }).text) as { cameras: Record<string, unknown>; phase: string };
    expect(Object.keys(json.cameras)).toEqual(['top', 'front', 'side']);
    expect(hub.broadcasts.find((m) => m.type === 'views')).toMatchObject({ type: 'views', episodeId: null });
    expect(r.summary).toBe('vues : front, top');

    sim.views = null;
    const r2 = await handlers.get_views({});
    expect(r2.ok).toBe(false);
    expect((r2.content[0] as { text: string }).text).toBe(NO_IMAGES_TEXT);
  });

  it('movement tools return ActionResult texts with the resulting pose, or the structured error', async () => {
    const { handlers, sim } = setup();
    const okMove = await handlers.move_scissors({ x: 12, y: 4, z: 38, mode: 'absolute' });
    expect(okMove.ok).toBe(true);
    expect((okMove.content[0] as { text: string }).text).toMatch(/^ok : moved\n\{"cutPointCm":\[12,4,38\]/);
    expect(okMove.summary).toBe('ciseaux vers X 12, Y 4, Z 38');
    expect(sim.applied.at(-1)).toEqual({ type: 'move_scissors', x: 12, y: 4, z: 38, mode: 'absolute' });

    const far = await handlers.move_scissors({ x: 0, y: 0, z: 150, mode: 'absolute' });
    expect(far.ok).toBe(false);
    expect((far.content[0] as { text: string }).text).toBe('out_of_reach : beyond arm reach (150 cm, 100 cm)');

    const cut = await handlers.cut({});
    expect(cut.ok).toBe(false);
    expect(cut.summary).toBe('coupe : misaligned, 1,4 cm, 62°');

    await handlers.rotate_scissors({ yaw: 10, mode: 'relative' });
    expect(sim.applied.at(-1)).toEqual({ type: 'rotate_scissors', yaw: 10, mode: 'relative' });
    const basket = await handlers.move_basket({ x: 3, y: -2, mode: 'absolute' });
    expect(basket.summary).toBe('panier à X 0, Y 0');
  });

  it('move_camera applies the action and appends the refreshed view of that camera', async () => {
    const { handlers, sim } = setup();
    sim.views = (cams) => ({ images: cams.map((camera) => ({ camera, pngBase64: PNG, widthPx: 800, heightPx: 800 })), json: { ...sim.state, tomatoes: [] } });
    const r = await handlers.move_camera({ camera: 'side', dz: 5, zoom: 2 });
    expect(sim.applied.at(-1)).toEqual({ type: 'move_camera', camera: 'side', dz: 5, zoom: 2 });
    expect(r.content.map((b) => b.type)).toEqual(['text', 'text', 'image']);
    expect(r.summary).toMatch(/^caméra side à /);
  });

  it('report closes the episode with the real outcome, refuses during falling, is harmless in manual mode', async () => {
    const { handlers, session, journal } = setup();
    const manual = await handlers.report({ outcome: 'aborted', note: 'rien' });
    expect(manual.ok).toBe(true);
    expect(manual.summary).toBe('rapport : aucun épisode');

    session.handleSimEvent({ type: 'ripe_detected', tomatoId: 1, detector: 'hsv', confidence: 1 });
    session.noteToolResult('cut', true);
    const falling = await handlers.report({ outcome: 'harvested', note: 'trop tôt' });
    expect(falling.ok).toBe(false);
    expect((falling.content[0] as { text: string }).text).toBe(FALLING_TEXT);
    session.handleSimEvent({ type: 'tomato_landed', tomatoId: 1, inBasket: false });
    const done = await handlers.report({ outcome: 'harvested', note: 'je pense' });
    expect(done.ok).toBe(true);
    expect((done.content[0] as { text: string }).text).toMatch(/clos : missed \(déclaré harvested\) ; total 0 récoltée\(s\), 1 ratée\(s\)$/);
    expect(session.get().phase).toBe('missed');
    done.after?.();
    expect(session.get().phase).toBe('idle');
    expect(journal.records[0]).toMatchObject({ outcome: 'missed' });
  });
});
```

- [ ] **Step 2: Vérifier l'échec**

Run: `npx vitest run packages/server/src/mcp/handlers.test.ts`
Expected: FAIL, module `./handlers` introuvable.

- [ ] **Step 3: Écrire `handlers.ts`**

`packages/server/src/mcp/handlers.ts` :

```ts
import { CAMERA_IDS, createDefaultWorld, MAX_TOOL_CALLS_PER_EPISODE, ToolSchemas, type ActionResult, type CameraId, type SimAction, type ToolInput, type ToolName, type ViewsResult, type WorldState } from '@tomato/shared';
import type { Hub } from '../hub/hub';
import type { SimBridge } from '../sim/simBridge';
import { outcomeForPhase } from '../state/rules';
import type { Session } from '../state/session';
import { actionResultText, compactJson, png, summarizeAction, text, viewHeader, type ContentBlock } from './format';

export interface ToolOutcome {
  ok: boolean;
  content: ContentBlock[];
  summary: string;
  /** Exécuté par le runner APRÈS la diffusion de `tool_call_result` (clôture d'épisode par `report`). */
  after?: () => void;
}

export type ToolHandler = (rawArgs: unknown) => Promise<ToolOutcome>;

export interface ToolDeps {
  sim: SimBridge;
  session: Session;
  hub: Hub;
}

export const NO_IMAGES_TEXT = 'not_available : simulation did not answer (aucune image) ; vérifie que la page sim est ouverte sur http://localhost:5173';
export const FALLING_TEXT = 'la tomate tombe encore : appelle get_status jusqu\'à l\'événement tomato_landed, puis report';

const failure = (summary: string, message: string): ToolOutcome => ({ ok: false, content: [text(message)], summary });

/** Retire les clés `undefined` (exactOptionalPropertyTypes : SimAction n'accepte pas `dx: undefined`). */
function definedNumbers<K extends string>(obj: Record<K, number | undefined>): Partial<Record<K, number>> {
  const out: Partial<Record<K, number>> = {};
  for (const k of Object.keys(obj) as K[]) {
    const v = obj[k];
    if (v !== undefined) out[k] = v;
  }
  return out;
}

function issuesText(error: { issues: { path: (string | number)[]; message: string }[] }): string {
  return error.issues.map((i) => `${i.path.length > 0 ? i.path.join('.') : '(racine)'} ${i.message}`).join(' ; ');
}

export function createToolHandlers(deps: ToolDeps): Record<ToolName, ToolHandler> {
  const known = (): WorldState => deps.sim.latestState() ?? createDefaultWorld(0);

  /** Valide les arguments avec le schéma partagé ; une erreur devient un texte « invalid_argument : … ». */
  function withArgs<N extends ToolName>(name: N, run: (args: ToolInput<N>) => Promise<ToolOutcome>): ToolHandler {
    return (rawArgs) => {
      const parsed = ToolSchemas[name].safeParse(rawArgs ?? {});
      if (!parsed.success) return Promise.resolve(failure(`${name} : invalid_argument`, `invalid_argument : ${issuesText(parsed.error)}`));
      return run(parsed.data as ToolInput<N>);
    };
  }

  async function applyAction(tool: ToolName, action: SimAction, focus: (s: WorldState) => unknown): Promise<{ r: ActionResult; outcome: ToolOutcome }> {
    const r = await deps.sim.apply(action);
    return { r, outcome: { ok: r.ok, content: [text(actionResultText(r, r.ok ? focus(r.state) : undefined))], summary: summarizeAction(tool, r) } };
  }

  async function views(cameras: CameraId[]): Promise<{ result: ViewsResult; blocks: ContentBlock[] } | null> {
    const raw = await deps.sim.renderViews(cameras);
    if (raw.images.length === 0) return null;
    const result: ViewsResult = { images: raw.images, json: { ...raw.json, phase: deps.session.get().phase } };
    deps.hub.broadcast({ type: 'views', episodeId: deps.session.get().episodeId, result });
    deps.hub.broadcast({ type: 'block_activity', from: 'simulation', to: 'server', label: `vues ${cameras.join(', ')}` });
    return { result, blocks: result.images.flatMap((img) => [text(viewHeader(img, result.json.cameras[img.camera])), png(img)]) };
  }

  return {
    get_status: withArgs('get_status', () => {
      const s = deps.session.get();
      const w = known();
      const status = {
        phase: s.phase, episodeId: s.episodeId, targetTomatoId: s.targetTomatoId, simConnected: deps.hub.simConnected(),
        simTimeS: w.simTimeS, toolCalls: { used: s.toolCallsThisEpisode, max: MAX_TOOL_CALLS_PER_EPISODE }, lastEvent: s.lastEvent,
        tomatoes: w.tomatoes.map((t) => ({ id: t.id, state: t.state, ripeness: t.ripeness, positionCm: t.positionCm, attached: t.attached, stem: t.stem })),
        scissors: w.scissors, basket: w.basket, cameras: w.cameras, limits: w.limits,
      };
      return Promise.resolve({ ok: true, content: [text(compactJson(status))], summary: `état : ${s.phase}, ${w.tomatoes.length} tomates` });
    }),
    get_views: withArgs('get_views', async (args) => {
      const cameras = args.cameras ?? [...CAMERA_IDS];
      const v = await views(cameras);
      if (v === null) return failure('vues : not_available', NO_IMAGES_TEXT);
      return { ok: true, content: [...v.blocks, text(compactJson(v.result.json))], summary: `vues : ${cameras.join(', ')}` };
    }),
    move_camera: withArgs('move_camera', async (args) => {
      const action: SimAction = { type: 'move_camera', camera: args.camera, ...definedNumbers({ dx: args.dx, dy: args.dy, dz: args.dz, yaw: args.yaw, tilt: args.tilt, zoom: args.zoom }) };
      const { r, outcome } = await applyAction('move_camera', action, (s) => s.cameras[args.camera]);
      if (!r.ok) return { ...outcome, summary: `caméra ${args.camera} : ${r.error}` };
      const v = await views([args.camera]);
      const pose = r.state.cameras[args.camera];
      const summary = `caméra ${args.camera} à ${compactJson(pose.positionCm)}, lacet ${pose.yawDeg}, tangage ${pose.tiltDeg}`;
      return { ok: true, content: [...outcome.content, ...(v === null ? [text(NO_IMAGES_TEXT)] : v.blocks)], summary };
    }),
    move_scissors: withArgs('move_scissors', async (args) => (await applyAction('move_scissors', { type: 'move_scissors', x: args.x, y: args.y, z: args.z, mode: args.mode }, (s) => s.scissors)).outcome),
    rotate_scissors: withArgs('rotate_scissors', async (args) => {
      const action: SimAction = { type: 'rotate_scissors', mode: args.mode, ...definedNumbers({ yaw: args.yaw, pitch: args.pitch, roll: args.roll }) };
      return (await applyAction('rotate_scissors', action, (s) => s.scissors)).outcome;
    }),
    open_scissors: withArgs('open_scissors', async () => (await applyAction('open_scissors', { type: 'open_scissors' }, (s) => ({ openingDeg: s.scissors.openingDeg }))).outcome),
    cut: withArgs('cut', async () => (await applyAction('cut', { type: 'cut' }, (s) => ({ targetTomatoId: s.targetTomatoId, scissors: s.scissors }))).outcome),
    move_basket: withArgs('move_basket', async (args) => (await applyAction('move_basket', { type: 'move_basket', x: args.x, y: args.y, mode: args.mode }, (s) => s.basket)).outcome),
    report: withArgs('report', (args) => {
      const s = deps.session.get();
      if (s.episodeId === null) return Promise.resolve({ ok: true, content: [text('aucun épisode en cours (pilotage manuel) : rien à clore')], summary: 'rapport : aucun épisode' });
      if (s.phase === 'falling') return Promise.resolve(failure('rapport : chute en cours', FALLING_TEXT));
      const actual = outcomeForPhase(s.phase);
      const claim = actual === args.outcome ? '' : ` (déclaré ${args.outcome})`;
      return Promise.resolve({
        ok: true,
        content: [text(`épisode ${s.episodeId} clos : ${actual}${claim} ; total ${s.harvested} récoltée(s), ${s.missed} ratée(s)`)],
        summary: `rapport : ${actual}${claim}`,
        after: () => deps.session.endEpisode(args.outcome, args.note),
      });
    }),
  };
}
```

- [ ] **Step 4: Vérifier le succès**

Run: `npx vitest run packages/server/src/mcp/handlers.test.ts`
Expected: PASS, 6 tests.

- [ ] **Step 5: Commit**

```bash
git add packages/server/src/mcp/handlers.ts packages/server/src/mcp/handlers.test.ts
git commit -m "feat(server): handlers des neuf outils MCP (validation, textes structurés, images, rapport)"
```

---

### Task 10: Enveloppe des appels et serveur MCP

**Files:**
- Create: `packages/server/src/mcp/toolRunner.ts`, `packages/server/src/mcp/createMcpServer.ts`, `packages/server/src/testing/mcpClient.ts`, `packages/server/src/mcp/createMcpServer.test.ts`

**Interfaces:**
- Produces: `type ToolRunner = (tool: ToolName, rawArgs: unknown) => Promise<ToolOutcome>`, `LIMIT_TEXT`, `createToolRunner(deps, { now?, newId?, log? })` ; `MCP_SERVER_NAME = 'tomato-robot'`, `createMcpServer(deps: ToolDeps, opts?): McpServer` ; pour les tests : `connectInMemory(server): Promise<TestMcpClient>` (`call(tool, args)` → `{ blocks, isError }`, `toolNames()`, `close()`), `blocksOf(result)`.
- Enveloppe : `tool_call_start { episodeId: session.episodeId ?? 'manual', callId, tool, args }` + `block_activity agent→server` → compteur (`noteToolCall`) → garde : au-delà de `MAX_TOOL_CALLS_PER_EPISODE`, tout outil sauf `report` reçoit « limite atteinte … » → handler (une exception interne devient un texte `not_available`) → `noteToolResult` (règles de phase) → `tool_call_result { ok, summary, durationMs }` + `block_activity server→agent` → `after?.()`. Le résultat MCP porte `isError: !ok` (drapeau standard, pas une exception).

- [ ] **Step 1: Test (échoue)**

`packages/server/src/mcp/createMcpServer.test.ts` :

```ts
import { MAX_TOOL_CALLS_PER_EPISODE, TOOL_NAMES, createDefaultWorld } from '@tomato/shared';
import { afterEach, describe, expect, it } from 'vitest';
import { createSession } from '../state/session';
import { createFakeHub, createFakeSim, createMemoryJournal } from '../testing/fakes';
import { connectInMemory, type TestMcpClient } from '../testing/mcpClient';
import { createMcpServer } from './createMcpServer';
import { LIMIT_TEXT } from './toolRunner';

let open: TestMcpClient | null = null;

afterEach(async () => {
  await open?.close();
  open = null;
});

async function setup() {
  const hub = createFakeHub();
  const sim = createFakeSim(createDefaultWorld(1));
  const session = createSession(hub, { sim, journal: createMemoryJournal() });
  let clock = 1000;
  let n = 0;
  const server = createMcpServer({ sim, session, hub }, { now: () => (clock += 7), newId: () => `call-${++n}` });
  open = await connectInMemory(server);
  return { hub, sim, session, mcp: open };
}

describe('MCP server over the in-memory transport', () => {
  it('lists the nine tools with their descriptions and strict input schemas', async () => {
    const { mcp } = await setup();
    expect(await mcp.toolNames()).toEqual([...TOOL_NAMES]);
    const tools = (await mcp.client.listTools()).tools;
    const move = tools.find((t) => t.name === 'move_scissors')!;
    expect(move.description).toMatch(/^Move the scissors cut point/);
    expect(move.inputSchema).toMatchObject({ type: 'object', required: ['x', 'y', 'z', 'mode'] });
  });

  it('returns text and image content blocks and broadcasts tool_call_start / tool_call_result', async () => {
    const { mcp, hub } = await setup();
    const status = await mcp.call('get_status');
    expect(status.isError).toBe(false);
    expect(status.blocks[0]!.type).toBe('text');
    expect(JSON.parse(status.blocks[0]!.text!)).toMatchObject({ phase: 'idle', episodeId: null });
    expect(hub.broadcasts.filter((m) => m.type === 'tool_call_start')).toEqual([
      { type: 'tool_call_start', episodeId: 'manual', callId: 'call-1', tool: 'get_status', args: {} },
    ]);
    expect(hub.broadcasts.filter((m) => m.type === 'tool_call_result')).toEqual([
      { type: 'tool_call_result', episodeId: 'manual', callId: 'call-1', ok: true, summary: 'état : idle, 0 tomates', durationMs: 7 },
    ]);
    const blocks = hub.broadcasts.filter((m) => m.type === 'block_activity');
    expect(blocks.map((b) => (b.type === 'block_activity' ? `${b.from}>${b.to}` : ''))).toEqual(['agent>server', 'server>agent']);

    const views = await mcp.call('get_views', { cameras: ['top'] });
    expect(views.isError).toBe(true);
    expect(views.blocks[0]!.text).toMatch(/^not_available : /);
  });

  it('serves a real image block for get_views when the sim answers', async () => {
    const { mcp, sim } = await setup();
    sim.views = (cams) => ({ images: cams.map((camera) => ({ camera, pngBase64: 'aGVsbG8=', widthPx: 800, heightPx: 800 })), json: { ...sim.state, tomatoes: [] } });
    const r = await mcp.call('get_views', { cameras: ['front'] });
    expect(r.isError).toBe(false);
    expect(r.blocks.map((b) => b.type)).toEqual(['text', 'image', 'text']);
    expect(r.blocks[1]).toEqual({ type: 'image', data: 'aGVsbG8=', mimeType: 'image/png' });
  });

  it('refuses every tool but report beyond MAX_TOOL_CALLS_PER_EPISODE, and report closes the episode', async () => {
    const { mcp, session } = await setup();
    session.handleSimEvent({ type: 'ripe_detected', tomatoId: 1, detector: 'hsv', confidence: 1 });
    for (let i = 0; i < MAX_TOOL_CALLS_PER_EPISODE; i++) {
      expect((await mcp.call('open_scissors')).isError).toBe(false);
    }
    expect(session.get().toolCallsThisEpisode).toBe(MAX_TOOL_CALLS_PER_EPISODE);
    const over = await mcp.call('move_basket', { x: 0, y: 0, mode: 'absolute' });
    expect(over.isError).toBe(true);
    expect(over.blocks[0]!.text).toBe(LIMIT_TEXT);
    const report = await mcp.call('report', { outcome: 'aborted', note: 'limite' });
    expect(report.isError).toBe(false);
    expect(report.blocks[0]!.text).toMatch(/clos : aborted/);
    expect(session.get()).toMatchObject({ phase: 'idle', episodeId: null, toolCallsThisEpisode: 0 });
  });

  it('malformed arguments are refused by the SDK before the handler and reach the agent as an error text', async () => {
    const { mcp, hub } = await setup();
    const r = await mcp.call('move_scissors', { x: 1 });
    expect(r.isError).toBe(true);
    expect(r.blocks[0]!.text).toMatch(/Input validation error: Invalid arguments for tool move_scissors/);
    expect(hub.broadcasts.filter((m) => m.type === 'tool_call_start')).toEqual([]);
  });
});
```

- [ ] **Step 2: Vérifier l'échec**

Run: `npx vitest run packages/server/src/mcp/createMcpServer.test.ts`
Expected: FAIL, modules introuvables.

- [ ] **Step 3: Écrire `toolRunner.ts`**

`packages/server/src/mcp/toolRunner.ts` :

```ts
import { randomUUID } from 'node:crypto';
import { MAX_TOOL_CALLS_PER_EPISODE, type ToolName } from '@tomato/shared';
import { silentLogger, type Logger } from '../log';
import { text } from './format';
import { createToolHandlers, type ToolDeps, type ToolOutcome } from './handlers';

export type ToolRunner = (tool: ToolName, rawArgs: unknown) => Promise<ToolOutcome>;

export interface ToolRunnerOptions {
  now?: () => number;
  newId?: () => string;
  log?: Logger;
}

export const LIMIT_TEXT = `limite atteinte : ${MAX_TOOL_CALLS_PER_EPISODE} appels d'outils dans cet épisode ; appelle report maintenant`;

const asRecord = (raw: unknown): Record<string, unknown> => (typeof raw === 'object' && raw !== null ? (raw as Record<string, unknown>) : {});

/**
 * Enveloppe commune des neuf outils : diffusion `tool_call_start` / `tool_call_result` (résumé français, durée),
 * compteur d'appels et garde MAX_TOOL_CALLS_PER_EPISODE, règles de phase, jamais d'exception vers l'agent.
 */
export function createToolRunner(deps: ToolDeps, opts: ToolRunnerOptions = {}): ToolRunner {
  const now = opts.now ?? Date.now;
  const newId = opts.newId ?? randomUUID;
  const log = opts.log ?? silentLogger;
  const handlers = createToolHandlers(deps);

  return async (tool, rawArgs) => {
    const callId = newId();
    const episodeId = deps.session.get().episodeId ?? 'manual';
    const startedMs = now();
    deps.hub.broadcast({ type: 'tool_call_start', episodeId, callId, tool, args: asRecord(rawArgs) });
    deps.hub.broadcast({ type: 'block_activity', from: 'agent', to: 'server', label: tool });

    const count = deps.session.noteToolCall(tool);
    let outcome: ToolOutcome;
    if (tool !== 'report' && count > MAX_TOOL_CALLS_PER_EPISODE) {
      outcome = { ok: false, content: [text(LIMIT_TEXT)], summary: `${tool} : limite d'appels atteinte` };
    } else {
      try {
        outcome = await handlers[tool](rawArgs);
      } catch (e) {
        log(`mcp: erreur interne dans ${tool} (${String(e)})`);
        outcome = { ok: false, content: [text(`not_available : erreur interne du serveur (${String(e)})`)], summary: `${tool} : erreur interne` };
      }
    }
    deps.session.noteToolResult(tool, outcome.ok);
    deps.hub.broadcast({ type: 'tool_call_result', episodeId, callId, ok: outcome.ok, summary: outcome.summary, durationMs: now() - startedMs });
    deps.hub.broadcast({ type: 'block_activity', from: 'server', to: 'agent', label: outcome.summary });
    outcome.after?.();
    return outcome;
  };
}
```

- [ ] **Step 4: Écrire `createMcpServer.ts`**

`packages/server/src/mcp/createMcpServer.ts` :

```ts
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { TOOL_DESCRIPTIONS, TOOL_NAMES, ToolSchemas } from '@tomato/shared';
import { VERSION } from '../version';
import type { ToolDeps } from './handlers';
import { createToolRunner, type ToolRunnerOptions } from './toolRunner';

export const MCP_SERVER_NAME = 'tomato-robot';

/**
 * Serveur MCP « tomato-robot » : les neuf outils de `ToolSchemas` / `TOOL_DESCRIPTIONS`.
 * Une instance par requête HTTP (mode sans session du transport streamable HTTP) ou par client en mémoire (tests).
 */
export function createMcpServer(deps: ToolDeps, opts: ToolRunnerOptions = {}): McpServer {
  const run = createToolRunner(deps, opts);
  const server = new McpServer({ name: MCP_SERVER_NAME, version: VERSION });
  for (const name of TOOL_NAMES) {
    server.registerTool(name, { description: TOOL_DESCRIPTIONS[name], inputSchema: ToolSchemas[name] }, async (args: unknown) => {
      const outcome = await run(name, args);
      return { content: outcome.content, isError: !outcome.ok };
    });
  }
  return server;
}
```

- [ ] **Step 5: Écrire `testing/mcpClient.ts`**

`packages/server/src/testing/mcpClient.ts` :

```ts
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { ToolName } from '@tomato/shared';

export interface Block {
  type: string;
  text?: string;
  data?: string;
  mimeType?: string;
}

export interface TestMcpClient {
  client: Client;
  /** Appelle un outil et renvoie ses blocs de contenu et le drapeau isError. */
  call(tool: ToolName, args?: Record<string, unknown>): Promise<{ blocks: Block[]; isError: boolean }>;
  toolNames(): Promise<string[]>;
  close(): Promise<void>;
}

/** Blocs de contenu d'un résultat callTool (le type du SDK est une union avec un format de compatibilité). */
export function blocksOf(result: unknown): Block[] {
  if (typeof result === 'object' && result !== null && Array.isArray((result as { content?: unknown }).content)) {
    return (result as { content: Block[] }).content;
  }
  return [];
}

/** Client MCP relié en mémoire à `server` (InMemoryTransport.createLinkedPair). */
export async function connectInMemory(server: McpServer): Promise<TestMcpClient> {
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: 'test-client', version: '0.0.0' });
  await server.connect(serverTransport);
  await client.connect(clientTransport);
  return {
    client,
    async call(tool, args = {}) {
      const r = await client.callTool({ name: tool, arguments: args });
      return { blocks: blocksOf(r), isError: (r as { isError?: boolean }).isError === true };
    },
    async toolNames() {
      return (await client.listTools()).tools.map((t) => t.name);
    },
    async close() {
      await client.close();
      await server.close();
    },
  };
}
```

- [ ] **Step 6: Vérifier le succès**

Run: `npx vitest run packages/server/src/mcp`
Expected: PASS, 16 tests (format 5, handlers 6, createMcpServer 5).

- [ ] **Step 7: Commit**

```bash
git add packages/server/src/mcp/toolRunner.ts packages/server/src/mcp/createMcpServer.ts packages/server/src/mcp/createMcpServer.test.ts packages/server/src/testing/mcpClient.ts
git commit -m "feat(server): serveur MCP tomato-robot (neuf outils, diffusion des appels, limite par épisode)"
```

---

### Task 11: Application Express : `/mcp`, `/health`, `/episodes`

**Files:**
- Create: `packages/server/src/http/app.ts`, `packages/server/src/http/app.test.ts`

**Interfaces:**
- Produces: `interface AppDeps { createServer: () => McpServer; journal; session; hub; log? }`, `createApp(deps): Express`.
- `POST /mcp` : mode sans session (`new StreamableHTTPServerTransport({})`, `sessionIdGenerator` omis), transport et `McpServer` neufs par requête, fermés sur `res.on('close')` ; `GET /mcp` et `DELETE /mcp` → 405 JSON-RPC ; `GET /health` → `{ ok, version, phase, episodeId, simConnected, harvested, missed }` ; `GET /episodes` → `EpisodeSummary[]` ; `GET /episodes/:id` → `EpisodeRecord` ou 404. Le test parle au serveur avec `StreamableHTTPClientTransport` du SDK, c'est-à-dire le même transport que Claude Code et l'Agent SDK.

- [ ] **Step 1: Test (échoue)**

`packages/server/src/http/app.test.ts` :

```ts
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import type { Transport } from '@modelcontextprotocol/sdk/shared/transport.js';
import { TOOL_NAMES, createDefaultWorld } from '@tomato/shared';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createMcpServer } from '../mcp/createMcpServer';
import { createSession } from '../state/session';
import { createFakeHub, createFakeSim, createMemoryJournal, type MemoryJournal } from '../testing/fakes';
import { blocksOf } from '../testing/mcpClient';
import { createApp } from './app';

let http: Server;
let base: string;
let journal: MemoryJournal;

beforeAll(async () => {
  const hub = createFakeHub();
  hub.connected = false;
  const sim = createFakeSim(createDefaultWorld(1));
  journal = createMemoryJournal();
  const session = createSession(hub, { sim, journal });
  const app = createApp({ createServer: () => createMcpServer({ sim, session, hub }), journal, session, hub });
  http = await new Promise<Server>((resolve) => {
    const s = app.listen(0, '127.0.0.1', () => resolve(s));
  });
  base = `http://127.0.0.1:${(http.address() as AddressInfo).port}`;
});

afterAll(async () => {
  await new Promise<void>((resolve) => http.close(() => resolve()));
});

describe('HTTP app', () => {
  it('serves MCP over streamable HTTP with the SDK client transport (the one Claude Code uses)', async () => {
    const client = new Client({ name: 'http-test', version: '0.0.0' });
    await client.connect(new StreamableHTTPClientTransport(new URL(`${base}/mcp`)) as Transport);
    expect((await client.listTools()).tools.map((t) => t.name)).toEqual([...TOOL_NAMES]);
    const r = await client.callTool({ name: 'get_status', arguments: {} });
    const blocks = blocksOf(r);
    expect(blocks[0]!.type).toBe('text');
    expect(JSON.parse(blocks[0]!.text!)).toMatchObject({ phase: 'idle', simConnected: false });
    const second = await client.callTool({ name: 'cut', arguments: {} });
    expect(blocksOf(second)[0]!.text).toMatch(/^ok : cut ok/);
    await client.close();
  });

  it('answers 405 to GET and DELETE on /mcp', async () => {
    const get = await fetch(`${base}/mcp`, { headers: { accept: 'text/event-stream' } });
    expect(get.status).toBe(405);
    const del = await fetch(`${base}/mcp`, { method: 'DELETE' });
    expect(del.status).toBe(405);
  });

  it('exposes /health, /episodes and /episodes/:id', async () => {
    const health = (await (await fetch(`${base}/health`)).json()) as Record<string, unknown>;
    expect(health).toMatchObject({ ok: true, phase: 'idle', simConnected: false, harvested: 0, missed: 0 });
    expect(await (await fetch(`${base}/episodes`)).json()).toEqual([]);
    journal.open('ep-x', 2);
    await journal.close('harvested', 'n', 3);
    expect(await (await fetch(`${base}/episodes`)).json()).toEqual([{ episodeId: 'ep-x', startedAt: new Date(0).toISOString(), outcome: 'harvested', tomatoId: 2 }]);
    expect(await (await fetch(`${base}/episodes/ep-x`)).json()).toMatchObject({ episodeId: 'ep-x', toolCalls: 3 });
    expect((await fetch(`${base}/episodes/nope`)).status).toBe(404);
  });
});
```

- [ ] **Step 2: Vérifier l'échec**

Run: `npx vitest run packages/server/src/http/app.test.ts`
Expected: FAIL, module `./app` introuvable.

- [ ] **Step 3: Écrire `app.ts`**

`packages/server/src/http/app.ts` :

```ts
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import type { Transport } from '@modelcontextprotocol/sdk/shared/transport.js';
import express, { type Express, type Request, type Response } from 'express';
import type { EpisodeJournal } from '../episodes/journal';
import type { Hub } from '../hub/hub';
import { silentLogger, type Logger } from '../log';
import type { Session } from '../state/session';
import { VERSION } from '../version';

export interface AppDeps {
  /** Une instance de serveur MCP par requête (mode sans session). */
  createServer: () => McpServer;
  journal: EpisodeJournal;
  session: Session;
  hub: Hub;
  log?: Logger;
}

const JSON_BODY_LIMIT = '1mb';

function methodNotAllowed(_req: Request, res: Response): void {
  res.status(405).json({ jsonrpc: '2.0', error: { code: -32000, message: 'Method not allowed.' }, id: null });
}

/**
 * Express : `POST /mcp` (streamable HTTP sans session : transport + serveur neufs par requête, fermés à la fin
 * de la réponse), `GET`/`DELETE /mcp` → 405 (pas de flux SSE autonome, pas de session à terminer),
 * `GET /health`, `GET /episodes`, `GET /episodes/:id`.
 */
export function createApp(deps: AppDeps): Express {
  const log = deps.log ?? silentLogger;
  const app = express();
  app.use(express.json({ limit: JSON_BODY_LIMIT }));

  app.post('/mcp', async (req: Request, res: Response) => {
    const server = deps.createServer();
    const transport = new StreamableHTTPServerTransport({});
    res.on('close', () => {
      void transport.close();
      void server.close();
    });
    try {
      // Cast : le SDK déclare `onclose: (() => void) | undefined` sur la classe et `onclose?: () => void`
      // sur l'interface Transport, ce que `exactOptionalPropertyTypes` refuse (vérifié sur sdk 1.30.0).
      await server.connect(transport as Transport);
      await transport.handleRequest(req, res, req.body);
    } catch (e) {
      log(`mcp: requête en échec (${String(e)})`);
      if (!res.headersSent) res.status(500).json({ jsonrpc: '2.0', error: { code: -32603, message: 'Internal server error' }, id: null });
    }
  });
  app.get('/mcp', methodNotAllowed);
  app.delete('/mcp', methodNotAllowed);

  app.get('/health', (_req: Request, res: Response) => {
    const s = deps.session.get();
    res.json({ ok: true, version: VERSION, phase: s.phase, episodeId: s.episodeId, simConnected: deps.hub.simConnected(), harvested: s.harvested, missed: s.missed });
  });

  app.get('/episodes', async (_req: Request, res: Response) => {
    res.json(await deps.journal.list());
  });

  app.get('/episodes/:id', async (req: Request<{ id: string }>, res: Response) => {
    const record = await deps.journal.read(req.params.id);
    if (record === null) {
      res.status(404).json({ error: 'episode not found' });
      return;
    }
    res.json(record);
  });

  return app;
}
```

- [ ] **Step 4: Vérifier le succès**

Run: `npx vitest run packages/server/src/http/app.test.ts`
Expected: PASS, 3 tests.

- [ ] **Step 5: Commit**

```bash
git add packages/server/src/http/app.ts packages/server/src/http/app.test.ts
git commit -m "feat(server): Express — MCP streamable HTTP sans session sur /mcp, /health, /episodes"
```

---

### Task 12: Crochet du runner d'agent et point d'entrée

**Files:**
- Create: `packages/server/src/agentRunner.ts`, `packages/server/src/testing/fakeAgent.ts`, `packages/server/src/agentRunner.test.ts`
- Modify: `packages/server/src/index.ts` (réécriture complète)

**Interfaces:**
- Produces: `interface AgentRunner { wake(event: WakeEvent): void; busy(): boolean; stop(): void }`, `interface AgentRunnerDeps { hub: Hub; session: Session; mcpUrl: string; model: string; systemPrompt: string }`, `type CreateAgentRunner`, `AGENT_MODULE = './agent/index.js'`, `createNoopRunner(log?)`, `loadAgentRunner(deps, log?, specifier?)`.
- Contrat pour M6 : exporter `createAgentRunner(deps: AgentRunnerDeps): AgentRunner` depuis `packages/server/src/agent/index.ts` ; `index.ts` le charge dynamiquement quand `TOMATO_AGENT` vaut `on` (défaut) et se rabat sur le runner inerte si le module est absent. Le prompt système est lu dans `packages/server/prompts/system.md` s'il existe (M6), sinon chaîne vide.

- [ ] **Step 1: Test (échoue)**

`packages/server/src/agentRunner.test.ts` :

```ts
import { createDefaultWorld } from '@tomato/shared';
import { describe, expect, it } from 'vitest';
import { createNoopRunner, loadAgentRunner, type AgentRunnerDeps } from './agentRunner';
import { createSession } from './state/session';
import { createFakeHub, createFakeSim, createMemoryJournal, type FakeHub } from './testing/fakes';

function deps(): AgentRunnerDeps & { hub: FakeHub } {
  const hub = createFakeHub();
  const session = createSession(hub, { sim: createFakeSim(createDefaultWorld(1)), journal: createMemoryJournal() });
  return { hub, session, mcpUrl: 'http://localhost:7331/mcp', model: 'claude-opus-5', systemPrompt: '' };
}

describe('agent runner hook', () => {
  it('the no-op runner only logs wake-ups', () => {
    const logs: string[] = [];
    const runner = createNoopRunner((l) => logs.push(l));
    runner.wake({ tomatoId: 4, positionCm: [0, 0, 0], ripeness: 1 });
    expect(runner.busy()).toBe(false);
    expect(logs).toEqual(['agent: désactivé, réveil ignoré (tomate 4)']);
  });

  it('falls back to the no-op runner when the M6 module is missing', async () => {
    const logs: string[] = [];
    const runner = await loadAgentRunner(deps(), (l) => logs.push(l), './agent/does-not-exist.js');
    expect(runner.busy()).toBe(false);
    expect(logs[0]).toMatch(/module \.\/agent\/does-not-exist\.js absent/);
  });

  it('loads a module exporting createAgentRunner and wires it to the session wake-ups', async () => {
    const d = deps();
    const runner = await loadAgentRunner(d, undefined, './testing/fakeAgent.js');
    d.session.onWake((e) => runner.wake(e));
    d.session.handleSimEvent({ type: 'ripe_detected', tomatoId: 2, detector: 'hsv', confidence: 1 });
    expect(runner.busy()).toBe(true);
    expect(d.hub.broadcasts.at(-1)).toMatchObject({ type: 'episode_start', tomatoId: 2 });
  });
});
```

- [ ] **Step 2: Vérifier l'échec**

Run: `npx vitest run packages/server/src/agentRunner.test.ts`
Expected: FAIL, module `./agentRunner` introuvable.

- [ ] **Step 3: Écrire `agentRunner.ts`**

`packages/server/src/agentRunner.ts` :

```ts
import type { Hub } from './hub/hub';
import { silentLogger, type Logger } from './log';
import type { Session, WakeEvent } from './state/session';

/** Contrat du runner d'agent (implémenté par M6 dans `src/agent/`). */
export interface AgentRunner {
  wake(event: WakeEvent): void;
  busy(): boolean;
  stop(): void;
}

export interface AgentRunnerDeps {
  hub: Hub;
  session: Session;
  mcpUrl: string;
  model: string;
  systemPrompt: string;
}

export type CreateAgentRunner = (deps: AgentRunnerDeps) => AgentRunner;

/** Module M6 attendu : `packages/server/src/agent/index.ts` exportant `createAgentRunner`. */
export const AGENT_MODULE: string = './agent/index.js';

/** Runner inerte : TOMATO_AGENT=off ou M6 absent (pilotage à la main depuis Claude Code). */
export function createNoopRunner(log: Logger = silentLogger): AgentRunner {
  return {
    wake: (event) => log(`agent: désactivé, réveil ignoré (tomate ${event.tomatoId})`),
    busy: () => false,
    stop: () => undefined,
  };
}

function hasFactory(mod: unknown): mod is { createAgentRunner: CreateAgentRunner } {
  return typeof mod === 'object' && mod !== null && typeof (mod as { createAgentRunner?: unknown }).createAgentRunner === 'function';
}

/** Charge le runner M6 s'il existe ; sinon journalise et renvoie le runner inerte. */
export async function loadAgentRunner(deps: AgentRunnerDeps, log: Logger = silentLogger, specifier: string = AGENT_MODULE): Promise<AgentRunner> {
  let mod: unknown;
  try {
    mod = await import(specifier);
  } catch (e) {
    log(`agent: module ${specifier} absent (${String(e)}), runner désactivé`);
    return createNoopRunner(log);
  }
  if (!hasFactory(mod)) {
    log(`agent: ${specifier} n'exporte pas createAgentRunner, runner désactivé`);
    return createNoopRunner(log);
  }
  return mod.createAgentRunner(deps);
}
```

- [ ] **Step 4: Écrire `testing/fakeAgent.ts`**

`packages/server/src/testing/fakeAgent.ts` :

```ts
import type { AgentRunner, AgentRunnerDeps } from '../agentRunner';
import type { WakeEvent } from '../state/session';

/** Module d'agent factice pour tester `loadAgentRunner` (même forme que `src/agent/index.ts` de M6). */
export const wakes: WakeEvent[] = [];

export function createAgentRunner(deps: AgentRunnerDeps): AgentRunner {
  return {
    wake: (event) => {
      wakes.push(event);
      deps.hub.broadcast({ type: 'episode_start', episodeId: deps.session.get().episodeId ?? 'manual', tomatoId: event.tomatoId, sessionResumed: false });
    },
    busy: () => wakes.length > 0,
    stop: () => undefined,
  };
}
```

- [ ] **Step 5: Vérifier le succès**

Run: `npx vitest run packages/server/src/agentRunner.test.ts`
Expected: PASS, 3 tests.

- [ ] **Step 6: Réécrire `index.ts`**

`packages/server/src/index.ts` :

```ts
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createDefaultWorld } from '@tomato/shared';
import { createNoopRunner, loadAgentRunner } from './agentRunner';
import { readConfig } from './config';
import { createEpisodeJournal } from './episodes/journal';
import { createHub } from './hub/hub';
import { createApp } from './http/app';
import { consoleLogger } from './log';
import { createMcpServer } from './mcp/createMcpServer';
import { createSimBridge } from './sim/simBridge';
import { createSession } from './state/session';
import { VERSION } from './version';

/** Prompt système de l'agent (M6) ; vide tant que le fichier n'existe pas. */
const SYSTEM_PROMPT_PATH = resolve(import.meta.dirname, '../prompts/system.md');

async function main(): Promise<void> {
  const log = consoleLogger;
  const config = readConfig(process.env);
  log(`tomato-server ${VERSION} : démarrage`);

  const hub = createHub(config.wsPort, { log });
  const sim = createSimBridge(hub, { log });
  const journal = createEpisodeJournal(config.episodesDir, { log });
  const session = createSession(hub, { sim, journal, log });
  hub.setSnapshot(() => ({ type: 'snapshot', state: sim.latestState() ?? createDefaultWorld(0), phase: session.get().phase, episodeId: session.get().episodeId }));
  hub.onBroadcast((m) => journal.record(m));
  sim.onEvent((e) => session.handleSimEvent(e));

  const app = createApp({ createServer: () => createMcpServer({ sim, session, hub }, { log }), journal, session, hub, log });
  const wsPort = await hub.whenListening();
  const http = await new Promise<ReturnType<typeof app.listen>>((done) => {
    const s = app.listen(config.mcpPort, '127.0.0.1', () => done(s));
  });
  const mcpUrl = `http://localhost:${config.mcpPort}/mcp`;

  const systemPrompt = await readFile(SYSTEM_PROMPT_PATH, 'utf8').catch(() => '');
  const runner = config.agent === 'on'
    ? await loadAgentRunner({ hub, session, mcpUrl, model: config.model, systemPrompt }, log)
    : createNoopRunner(log);
  session.onWake((e) => runner.wake(e));

  log(`prêt : MCP ${mcpUrl} · WebSocket ws://localhost:${wsPort} · épisodes ${config.episodesDir} · agent ${config.agent} (${config.model})`);

  const shutdown = (): void => {
    log('arrêt');
    runner.stop();
    http.close();
    void hub.close().then(() => process.exit(0));
  };
  process.once('SIGINT', shutdown);
  process.once('SIGTERM', shutdown);
}

void main().catch((e: unknown) => {
  console.error(e);
  process.exit(1);
});
```

- [ ] **Step 7: Démarrage réel avec tsx**

Run (PowerShell) :
```powershell
$env:TOMATO_AGENT = 'off'; npm run start -w @tomato/server
```
Expected: deux lignes de journal, `tomato-server 0.2.0 : démarrage` puis `prêt : MCP http://localhost:7331/mcp · WebSocket ws://localhost:7332 · épisodes …data\episodes · agent off (claude-opus-5)`. Dans un second terminal : `curl http://127.0.0.1:7331/health` → `{"ok":true,"version":"0.2.0","phase":"idle","episodeId":null,"simConnected":false,"harvested":0,"missed":0}` ; `curl -o NUL -w "%{http_code}" http://127.0.0.1:7331/mcp` → `405` ; `curl http://127.0.0.1:7331/episodes` → `[]`. Ctrl+C arrête proprement (« arrêt »). Sans `TOMATO_AGENT=off` et sans M6, le journal affiche `agent: module ./agent/index.js absent (…), runner désactivé` et le serveur démarre quand même.

- [ ] **Step 8: Commit**

```bash
git add packages/server/src/agentRunner.ts packages/server/src/agentRunner.test.ts packages/server/src/testing/fakeAgent.ts packages/server/src/index.ts
git commit -m "feat(server): crochet AgentRunner (runner inerte, chargement de M6) et point d'entrée index.ts"
```

---

### Task 13: Test d'intégration de fin d'étape (sim scriptée)

**Files:**
- Create: `packages/server/src/integration/scriptedSim.ts`, `packages/server/src/integration/episode.test.ts`

**Interfaces:**
- Produces: `TINY_PNG`, `CUT_TOLERANCE_CM = 0.6`, `reduceScripted(world, action): ActionResult` (pur), `landsInBasket(world, tomatoId): boolean` (pur), `connectScriptedSim(port, initial): Promise<ScriptedSim>` (`world()`, `emit(event)`, `close()`).
- Montage réel : hub `ws` sur un port éphémère, `createSimBridge`, `createSession`, `createEpisodeJournal` dans un dossier temporaire, serveur MCP relié en mémoire ; la sim scriptée est un vrai client WebSocket qui dit `hello`, envoie son état, répond aux actions par le réducteur et émet `tomato_landed` 10 ms après une coupe réussie. Script du contrat : `get_views` → `move_basket` → `move_scissors` ×3 → `open_scissors` → `cut` → `report`.

- [ ] **Step 1: Test (échoue)**

`packages/server/src/integration/episode.test.ts` :

```ts
import { mkdtemp, readdir, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createDefaultWorld, type Tomato, type WorldState } from '@tomato/shared';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createEpisodeJournal, type EpisodeJournal, type EpisodeRecord } from '../episodes/journal';
import { createHub, type Hub } from '../hub/hub';
import { createMcpServer } from '../mcp/createMcpServer';
import { createSimBridge } from '../sim/simBridge';
import { createSession, type Session } from '../state/session';
import { connectInMemory, type TestMcpClient } from '../testing/mcpClient';
import { connectScriptedSim, type ScriptedSim } from './scriptedSim';

const tomato: Tomato = {
  id: 1, state: 'ripe', ripeness: 1, positionCm: [10, 0, 60], radiusCm: 3,
  stem: { fromCm: [10, 0, 66], toCm: [10, 0, 63] }, attached: true, visibleIn: { top: 1, front: 1, side: 1 },
};
const world: WorldState = { ...createDefaultWorld(1), tomatoes: [tomato] };

async function waitFor(cond: () => boolean, what: string, timeoutMs = 3000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (!cond()) {
    if (Date.now() > deadline) throw new Error(`timeout waiting for ${what}`);
    await new Promise((r) => setTimeout(r, 5));
  }
}

let dir: string;
let hub: Hub;
let journal: EpisodeJournal;
let session: Session;
let sim: ScriptedSim;
let mcp: TestMcpClient;

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'tomato-episode-'));
  hub = createHub(0);
  const bridge = createSimBridge(hub, { timeoutMs: 2000 });
  journal = createEpisodeJournal(dir);
  session = createSession(hub, { sim: bridge, journal });
  hub.onBroadcast((m) => journal.record(m));
  bridge.onEvent((e) => session.handleSimEvent(e));
  sim = await connectScriptedSim(await hub.whenListening(), world);
  await waitFor(() => bridge.latestState() !== null, 'first state');
  mcp = await connectInMemory(createMcpServer({ sim: bridge, session, hub }));
});

afterEach(async () => {
  await mcp.close();
  await sim.close();
  await hub.close();
  await rm(dir, { recursive: true, force: true });
});

/** Le script de la spec : get_views → move_basket → move_scissors ×3 → open_scissors → cut → report. */
async function runScript(basketX: number, basketY: number): Promise<{ cut: string; report: string }> {
  sim.emit({ type: 'ripe_detected', tomatoId: 1, detector: 'hsv', confidence: 0.95 });
  await waitFor(() => session.get().phase === 'detected', 'detected');

  const views = await mcp.call('get_views');
  expect(views.isError).toBe(false);
  expect(views.blocks.filter((b) => b.type === 'image')).toHaveLength(3);
  expect(views.blocks.at(-1)!.text).toContain('"targetTomatoId":1');

  expect((await mcp.call('move_basket', { x: basketX, y: basketY, mode: 'absolute' })).isError).toBe(false);
  expect(session.get().phase).toBe('harvesting');
  for (const z of [80, 70, 63]) expect((await mcp.call('move_scissors', { x: 10, y: 0, z, mode: 'absolute' })).isError).toBe(false);
  expect((await mcp.call('open_scissors')).isError).toBe(false);
  const cut = await mcp.call('cut');
  expect(cut.isError).toBe(false);
  expect(session.get().phase).toBe('falling');
  await waitFor(() => session.get().phase === 'harvested' || session.get().phase === 'missed', 'landing');
  const phase = session.get().phase;
  const report = await mcp.call('report', { outcome: phase === 'harvested' ? 'harvested' : 'missed', note: 'script' });
  expect(report.isError).toBe(false);
  return { cut: cut.blocks[0]!.text!, report: report.blocks[0]!.text! };
}

async function readJournal(): Promise<EpisodeRecord> {
  await journal.flush();
  const files = await readdir(dir);
  expect(files).toHaveLength(1);
  return JSON.parse(await readFile(join(dir, files[0]!), 'utf8')) as EpisodeRecord;
}

describe('end-to-end episode with a scripted sim', () => {
  it('harvests the tomato when the basket is under it, and writes the journal', async () => {
    const { cut, report } = await runScript(10, 0);
    expect(cut).toMatch(/^ok : stem_cut/);
    expect(report).toMatch(/clos : harvested/);
    expect(session.get()).toMatchObject({ phase: 'idle', harvested: 1, missed: 0, episodeId: null });

    const record = await readJournal();
    expect(record).toMatchObject({ tomatoId: 1, outcome: 'harvested', note: 'script', toolCalls: 8 });
    expect(record.episodeId).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}-\d{3}Z-t1$/);
    const types = record.messages.map((m) => m.message.type);
    expect(types.filter((t) => t === 'tool_call_start')).toHaveLength(8);
    expect(types.filter((t) => t === 'tool_call_result')).toHaveLength(8);
    expect(types).toContain('views');
    const phases = record.messages.flatMap((m) => (m.message.type === 'phase' ? [m.message.phase] : []));
    expect(phases).toEqual(['detected', 'harvesting', 'cutting', 'falling', 'harvested', 'idle']);
    const summaries = record.messages.flatMap((m) => (m.message.type === 'tool_call_result' ? [m.message.summary] : []));
    expect(summaries).toContain('ciseaux vers X 10, Y 0, Z 63');
    expect(summaries).toContain('coupe : stem_cut');
  });

  it('misses the tomato when the basket is elsewhere', async () => {
    const { report } = await runScript(-30, -30);
    expect(report).toMatch(/clos : missed/);
    expect(session.get()).toMatchObject({ phase: 'idle', harvested: 0, missed: 1 });
    expect((await readJournal()).outcome).toBe('missed');
  });

  it('reports a misaligned cut as text and keeps harvesting', async () => {
    sim.emit({ type: 'ripe_detected', tomatoId: 1, detector: 'yolo', confidence: 0.7 });
    await waitFor(() => session.get().phase === 'detected', 'detected');
    await mcp.call('move_scissors', { x: 10, y: 0, z: 70, mode: 'absolute' });
    const cut = await mcp.call('cut');
    expect(cut.isError).toBe(true);
    expect(cut.blocks[0]!.text).toBe('misaligned : cut point is off the stem (7 cm, 90°)');
    expect(session.get().phase).toBe('harvesting');
  });
});
```

- [ ] **Step 2: Vérifier l'échec**

Run: `npx vitest run packages/server/src/integration`
Expected: FAIL, module `./scriptedSim` introuvable.

- [ ] **Step 3: Écrire `scriptedSim.ts`**

`packages/server/src/integration/scriptedSim.ts` :

```ts
import { fail, ok, type ActionResult, type SimAction, type SimEvent, type SimToServer, type WorldState } from '@tomato/shared';
import { WebSocket } from 'ws';
import { viewsPayloadOf } from '../sim/viewsFallback';

/** PNG 1×1 valide (signature iVBOR…), suffisant pour un bloc image. */
export const TINY_PNG = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';
/** Tolérance de coupe de la spec (0,6 cm). */
export const CUT_TOLERANCE_CM = 0.6;
/** Demi-côté du panier 20×20. */
const HALF_BASKET_CM = 10;
const LANDING_DELAY_MS = 10;

const dist = (a: readonly number[], b: readonly number[]): number => Math.hypot(a[0]! - b[0]!, a[1]! - b[1]!, a[2]! - b[2]!);

/** Réducteur scripté : panier et ciseaux téléportés, coupe réussie si le point de coupe est sur la tige cible. */
export function reduceScripted(world: WorldState, action: SimAction): ActionResult {
  switch (action.type) {
    case 'set_target':
      return ok({ ...world, targetTomatoId: action.tomatoId }, `target ${action.tomatoId ?? 'none'}`);
    case 'move_basket': {
      const [cx, cy, cz] = world.basket.centerCm;
      const x = action.mode === 'absolute' ? action.x : cx + action.x;
      const y = action.mode === 'absolute' ? action.y : cy + action.y;
      return ok({ ...world, basket: { ...world.basket, centerCm: [x, y, cz] } }, 'basket moved');
    }
    case 'move_scissors': {
      const [x0, y0, z0] = world.scissors.cutPointCm;
      const p = action.mode === 'absolute' ? ([action.x, action.y, action.z] as const) : ([x0 + action.x, y0 + action.y, z0 + action.z] as const);
      return ok({ ...world, scissors: { ...world.scissors, cutPointCm: p } }, 'scissors moved');
    }
    case 'rotate_scissors':
      return ok(world, 'scissors rotated');
    case 'open_scissors':
      return ok({ ...world, scissors: { ...world.scissors, openingDeg: 30 } }, 'scissors open');
    case 'cut': {
      const target = world.tomatoes.find((t) => t.id === world.targetTomatoId && t.attached);
      if (!target) return fail(world, 'nothing_between_blades', 'no attached target stem');
      const d = dist(world.scissors.cutPointCm, target.stem.toCm);
      if (d > CUT_TOLERANCE_CM) return fail(world, 'misaligned', 'cut point is off the stem', { distanceCm: Math.round(d * 10) / 10, angleDeg: 90 });
      return ok({ ...world, tomatoes: world.tomatoes.map((t) => (t.id === target.id ? { ...t, attached: false } : t)) }, 'stem_cut');
    }
    default:
      return fail(world, 'not_available', `scripted sim does not handle ${action.type}`);
  }
}

/** La tomate coupée tombe à la verticale : dans le panier si son XY est dans le rectangle 20×20. */
export function landsInBasket(world: WorldState, tomatoId: number): boolean {
  const t = world.tomatoes.find((x) => x.id === tomatoId);
  if (!t) return false;
  const [bx, by] = world.basket.centerCm;
  return Math.abs(t.positionCm[0] - bx) <= HALF_BASKET_CM && Math.abs(t.positionCm[1] - by) <= HALF_BASKET_CM;
}

export interface ScriptedSim {
  world(): WorldState;
  emit(event: SimEvent): void;
  close(): Promise<void>;
}

/** Faux client sim connecté au hub par un vrai WebSocket : hello, état, réponses scriptées, atterrissage après une coupe. */
export function connectScriptedSim(port: number, initial: WorldState): Promise<ScriptedSim> {
  let world = initial;
  const ws = new WebSocket(`ws://127.0.0.1:${port}`);
  const send = (m: SimToServer): void => ws.send(JSON.stringify(m));
  ws.on('message', (data) => {
    const m = JSON.parse(String(data)) as { type: string; requestId: string; action?: SimAction; cameras?: ('top' | 'front' | 'side')[] };
    if (m.type === 'apply_action' && m.action) {
      const result = reduceScripted(world, m.action);
      world = result.state;
      send({ type: 'action_result', requestId: m.requestId, result });
      send({ type: 'state', state: world });
      if (m.action.type === 'cut' && result.ok && world.targetTomatoId !== null) {
        const tomatoId = world.targetTomatoId;
        setTimeout(() => send({ type: 'sim_event', event: { type: 'tomato_landed', tomatoId, inBasket: landsInBasket(world, tomatoId) } }), LANDING_DELAY_MS);
      }
    } else if (m.type === 'render_views' && m.cameras) {
      const images = m.cameras.map((camera) => ({ camera, pngBase64: TINY_PNG, widthPx: 800, heightPx: 800 }));
      send({ type: 'views_result', requestId: m.requestId, result: { images, json: viewsPayloadOf(world) } });
    }
  });
  return new Promise((resolve, reject) => {
    ws.once('error', reject);
    ws.once('open', () => {
      send({ type: 'hello', role: 'sim' });
      send({ type: 'state', state: world });
      resolve({
        world: () => world,
        emit: (event) => send({ type: 'sim_event', event }),
        close: () => new Promise((done) => {
          ws.once('close', () => done());
          ws.close();
        }),
      });
    });
  });
}
```

- [ ] **Step 4: Vérifier le succès**

Run: `npx vitest run packages/server`
Expected: PASS, 50 tests (config 2, rules 5, version 1, journal 4, format 5, session 6, agentRunner 3, handlers 6, simBridge 4, hub 3, createMcpServer 5, app 3, integration 3).

- [ ] **Step 5: Commit**

```bash
git add packages/server/src/integration
git commit -m "test(server): épisode scripté de bout en bout — harvested, missed, coupe misaligned, journal écrit"
```

---

### Task 14: Bridge côté sim et bridge simulé

**Files:**
- Create: `packages/sim/src/bridge/viewsFallback.ts`, `packages/sim/src/bridge/bridge.ts`, `packages/sim/src/bridge/bridge.test.ts`, `packages/sim/src/bridge/fakeBridge.ts`, `packages/sim/src/bridge/fakeBridge.test.ts`

**Interfaces:**
- Consumes: `parseMessage`, messages de `@tomato/shared` ; `SimRuntime` (`ctx.store`, `apply`, `onEvent`).
- Produces: `type BridgeStatus = 'connected' | 'disconnected'`, `interface Bridge { onServerMessage(fn): () => void; status(): BridgeStatus; onStatus(fn): () => void; close(): void }`, `interface SocketLike`, `type SocketFactory`, `interface BridgeOptions { url; runtime; renderViews; socketFactory?; reconnectMs?; stateIntervalMs? }`, `RECONNECT_MS = 2000`, `STATE_INTERVAL_MS = 200`, `browserSocketFactory`, `createBridge(opts)` ; `interface ScriptEntry { atMs; message }`, `createFakeBridge(script, speed = 1): Bridge` (même forme que `messages[]` d'un `EpisodeRecord` : M7 rejoue `GET /episodes/:id` en passant `record.messages`).
- Comportement : à l'ouverture `hello { role: 'sim' }` puis `state` ; `state` à chaque changement du store limité à 5 Hz (un seul envoi différé, le dernier état gagne) et immédiatement après chaque `action_result` ; `apply_action` → `runtime.apply` → `action_result` ; `render_views` → `renderViews` → `views_result` (résultat sans image si le rendu échoue) ; `runtime.onEvent` → `sim_event` ; messages `ServerToDashboard` republiés localement (`onServerMessage`) ; reconnexion 2 s après une coupure, arrêtée par `close()`. La socket est injectable (`socketFactory`) : le test Node utilise une fausse socket et les faux timers de Vitest.

- [ ] **Step 1: Tests (échouent)**

`packages/sim/src/bridge/bridge.test.ts` :

```ts
import { createDefaultWorld, type ServerToDashboard, type SimToServer, type ViewsResult } from '@tomato/shared';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createRuntime, type SimRuntime } from '../core/runtime';
import { RECONNECT_MS, STATE_INTERVAL_MS, createBridge, type Bridge, type BridgeStatus, type SocketLike } from './bridge';

class FakeSocket implements SocketLike {
  static instances: FakeSocket[] = [];
  readyState = 0;
  sent: SimToServer[] = [];
  onopen: (() => void) | null = null;
  onmessage: ((ev: { data: unknown }) => void) | null = null;
  onclose: (() => void) | null = null;
  onerror: (() => void) | null = null;

  constructor(readonly url: string) {
    FakeSocket.instances.push(this);
  }
  open(): void {
    this.readyState = 1;
    this.onopen?.();
  }
  receive(m: unknown): void {
    this.onmessage?.({ data: typeof m === 'string' ? m : JSON.stringify(m) });
  }
  /** Coupure côté serveur. */
  drop(): void {
    this.readyState = 3;
    this.onerror?.();
    this.onclose?.();
  }
  send(data: string): void {
    this.sent.push(JSON.parse(data) as SimToServer);
  }
  close(): void {
    this.readyState = 3;
    this.onclose?.();
  }
  types(): string[] {
    return this.sent.map((m) => m.type);
  }
}

const views = (): Promise<ViewsResult> =>
  Promise.resolve({ images: [{ camera: 'front', pngBase64: 'iVBOR', widthPx: 800, heightPx: 800 }], json: { ...createDefaultWorld(1), tomatoes: [] } });

let runtime: SimRuntime;
let bridge: Bridge;
let statuses: BridgeStatus[];

function socket(): FakeSocket {
  return FakeSocket.instances.at(-1)!;
}

beforeEach(async () => {
  vi.useFakeTimers();
  FakeSocket.instances = [];
  runtime = await createRuntime(createDefaultWorld(1), null, []);
  bridge = createBridge({ url: 'ws://test', runtime, renderViews: views, socketFactory: (url) => new FakeSocket(url) });
  statuses = [];
  bridge.onStatus((s) => statuses.push(s));
});

afterEach(() => {
  bridge.close();
  vi.useRealTimers();
});

describe('sim bridge', () => {
  it('says hello as sim, then sends the state, and reports its status', () => {
    expect(bridge.status()).toBe('disconnected');
    expect(socket().url).toBe('ws://test');
    socket().open();
    expect(bridge.status()).toBe('connected');
    expect(statuses).toEqual(['connected']);
    expect(socket().sent[0]).toEqual({ type: 'hello', role: 'sim' });
    expect(socket().sent[1]).toMatchObject({ type: 'state', state: { seed: 1 } });
  });

  it('answers apply_action with action_result (same requestId) followed by a fresh state', () => {
    socket().open();
    socket().receive({ type: 'apply_action', requestId: 'r1', action: { type: 'set_paused', paused: true } });
    const [, , result, state] = socket().sent;
    expect(result).toMatchObject({ type: 'action_result', requestId: 'r1', result: { ok: true, message: 'paused' } });
    expect(state).toMatchObject({ type: 'state', state: { paused: true } });
    expect(runtime.ctx.store.get().paused).toBe(true);
  });

  it('answers render_views with views_result, or an empty result when rendering fails', async () => {
    socket().open();
    socket().receive({ type: 'render_views', requestId: 'v1', cameras: ['front'] });
    await vi.advanceTimersByTimeAsync(0);
    expect(socket().sent.at(-1)).toMatchObject({ type: 'views_result', requestId: 'v1', result: { images: [{ camera: 'front' }] } });

    bridge.close();
    bridge = createBridge({ url: 'ws://test', runtime, renderViews: () => Promise.reject(new Error('no webgl')), socketFactory: (url) => new FakeSocket(url) });
    socket().open();
    socket().receive({ type: 'render_views', requestId: 'v2', cameras: ['top'] });
    await vi.advanceTimersByTimeAsync(0);
    expect(socket().sent.at(-1)).toMatchObject({ type: 'views_result', requestId: 'v2', result: { images: [] } });
  });

  it('throttles state updates to 5 Hz, keeping the last one', () => {
    socket().open();
    const before = socket().sent.length;
    for (let i = 1; i <= 5; i++) runtime.ctx.store.update((s) => ({ ...s, simTimeS: i }));
    expect(socket().types().slice(before)).toEqual([]);
    vi.advanceTimersByTime(STATE_INTERVAL_MS);
    const states = socket().sent.slice(before);
    expect(states).toHaveLength(1);
    expect(states[0]).toMatchObject({ type: 'state', state: { simTimeS: 5 } });
    vi.advanceTimersByTime(STATE_INTERVAL_MS);
    runtime.ctx.store.update((s) => ({ ...s, simTimeS: 6 }));
    expect(socket().sent.at(-1)).toMatchObject({ type: 'state', state: { simTimeS: 6 } });
  });

  it('relays sim events and republishes dashboard messages, ignoring the rest', () => {
    socket().open();
    const seen: ServerToDashboard[] = [];
    bridge.onServerMessage((m) => seen.push(m));
    runtime.ctx.emitEvent({ type: 'plant_regenerated', seed: 4 });
    expect(socket().sent.at(-1)).toEqual({ type: 'sim_event', event: { type: 'plant_regenerated', seed: 4 } });
    socket().receive({ type: 'phase', phase: 'detected', reason: 'x' });
    socket().receive({ type: 'state', state: createDefaultWorld(2) });
    socket().receive('garbage');
    expect(seen).toEqual([{ type: 'phase', phase: 'detected', reason: 'x' }]);
  });

  it('reconnects 2 s after a drop and stops after close()', () => {
    socket().open();
    socket().drop();
    expect(bridge.status()).toBe('disconnected');
    expect(FakeSocket.instances).toHaveLength(1);
    vi.advanceTimersByTime(RECONNECT_MS - 1);
    expect(FakeSocket.instances).toHaveLength(1);
    vi.advanceTimersByTime(1);
    expect(FakeSocket.instances).toHaveLength(2);
    socket().open();
    expect(socket().sent[0]).toEqual({ type: 'hello', role: 'sim' });
    expect(statuses).toEqual(['connected', 'disconnected', 'connected']);
    const sentBeforeClose = socket().sent.length;
    bridge.close();
    expect(socket().readyState).toBe(3);
    expect(statuses.at(-1)).toBe('disconnected');
    vi.advanceTimersByTime(RECONNECT_MS * 2);
    expect(FakeSocket.instances).toHaveLength(2);
    runtime.ctx.store.update((s) => ({ ...s, simTimeS: 9 }));
    vi.advanceTimersByTime(STATE_INTERVAL_MS);
    expect(socket().sent).toHaveLength(sentBeforeClose);
  });
});
```

`packages/sim/src/bridge/fakeBridge.test.ts` :

```ts
import type { ServerToDashboard } from '@tomato/shared';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createFakeBridge } from './fakeBridge';

const script = [
  { atMs: 500, message: { type: 'phase', phase: 'harvesting', reason: 'b' } as ServerToDashboard },
  { atMs: 0, message: { type: 'phase', phase: 'detected', reason: 'a' } as ServerToDashboard },
  { atMs: 1000, message: { type: 'agent_text', episodeId: 'e', text: 'coupe' } as ServerToDashboard },
];

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe('createFakeBridge', () => {
  it('replays the script in time order and reports itself connected', () => {
    const bridge = createFakeBridge(script);
    const seen: string[] = [];
    bridge.onServerMessage((m) => seen.push(m.type === 'phase' ? m.phase : m.type));
    expect(bridge.status()).toBe('connected');
    vi.advanceTimersByTime(0);
    expect(seen).toEqual(['detected']);
    vi.advanceTimersByTime(499);
    expect(seen).toEqual(['detected']);
    vi.advanceTimersByTime(1);
    expect(seen).toEqual(['detected', 'harvesting']);
    vi.advanceTimersByTime(500);
    expect(seen).toEqual(['detected', 'harvesting', 'agent_text']);
    bridge.close();
  });

  it('honours the speed factor and close() cancels the rest', () => {
    const bridge = createFakeBridge(script, 2);
    const seen: string[] = [];
    const statuses: string[] = [];
    bridge.onServerMessage((m) => seen.push(m.type));
    bridge.onStatus((s) => statuses.push(s));
    vi.advanceTimersByTime(250);
    expect(seen).toEqual(['phase', 'phase']);
    bridge.close();
    vi.advanceTimersByTime(10_000);
    expect(seen).toEqual(['phase', 'phase']);
    expect(bridge.status()).toBe('disconnected');
    expect(statuses).toEqual(['disconnected']);
  });
});
```

- [ ] **Step 2: Vérifier l'échec**

Run: `npx vitest run packages/sim/src/bridge`
Expected: FAIL, modules introuvables.

- [ ] **Step 3: Écrire `viewsFallback.ts`**

`packages/sim/src/bridge/viewsFallback.ts` :

```ts
import type { ViewsPayload, ViewsResult, WorldState } from '@tomato/shared';

/** JSON des vues construit depuis le store, sans image (quand `renderViews` n'est pas disponible ou échoue). */
export function viewsPayloadOf(state: WorldState): ViewsPayload {
  return {
    simTimeS: state.simTimeS,
    phase: state.phase,
    targetTomatoId: state.targetTomatoId,
    tomatoes: state.tomatoes.map((t) => ({
      id: t.id, state: t.state, ripeness: t.ripeness, positionCm: t.positionCm, stem: t.stem, visibleIn: t.visibleIn,
    })),
    scissors: state.scissors,
    basket: state.basket,
    cameras: state.cameras,
    limits: state.limits,
  };
}

export const emptyViews = (state: WorldState): ViewsResult => ({ images: [], json: viewsPayloadOf(state) });
```

- [ ] **Step 4: Écrire `bridge.ts`**

`packages/sim/src/bridge/bridge.ts` :

```ts
import { parseMessage, type CameraId, type ServerToDashboard, type ServerToSim, type SimToServer, type ViewsResult } from '@tomato/shared';
import type { SimRuntime } from '../core/runtime';
import { emptyViews } from './viewsFallback';

export type BridgeStatus = 'connected' | 'disconnected';

export interface Bridge {
  onServerMessage(fn: (m: ServerToDashboard) => void): () => void;
  status(): BridgeStatus;
  onStatus(fn: (s: BridgeStatus) => void): () => void;
  close(): void;
}

/** Sous-ensemble de WebSocket utilisé par le bridge ; injectable dans les tests Node. */
export interface SocketLike {
  readonly readyState: number;
  send(data: string): void;
  close(): void;
  onopen: (() => void) | null;
  onmessage: ((ev: { data: unknown }) => void) | null;
  onclose: (() => void) | null;
  onerror: (() => void) | null;
}

export type SocketFactory = (url: string) => SocketLike;

export interface BridgeOptions {
  url: string;
  runtime: SimRuntime;
  renderViews: (cameras: CameraId[]) => Promise<ViewsResult>;
  socketFactory?: SocketFactory;
  reconnectMs?: number;
  stateIntervalMs?: number;
}

export const RECONNECT_MS = 2000;
/** 5 Hz. */
export const STATE_INTERVAL_MS = 200;
const OPEN = 1;

const DASHBOARD_TYPES: ReadonlySet<string> = new Set([
  'snapshot', 'phase', 'episode_start', 'episode_end', 'agent_text', 'tool_call_start', 'tool_call_result', 'views', 'sim_event', 'block_activity',
]);

/** Adapte le WebSocket du navigateur à SocketLike (les types DOM ne sont pas directement assignables). */
export const browserSocketFactory: SocketFactory = (url) => {
  const ws = new WebSocket(url);
  const s: SocketLike = {
    get readyState() {
      return ws.readyState;
    },
    send: (data) => ws.send(data),
    close: () => ws.close(),
    onopen: null, onmessage: null, onclose: null, onerror: null,
  };
  ws.onopen = () => s.onopen?.();
  ws.onmessage = (ev: MessageEvent<unknown>) => s.onmessage?.({ data: ev.data });
  ws.onclose = () => s.onclose?.();
  ws.onerror = () => s.onerror?.();
  return s;
};

/**
 * Client WebSocket de la page sim : hello, état à 5 Hz (et après chaque action), réponses aux commandes du serveur,
 * relais des événements, reconnexion automatique ; les messages destinés au dashboard sont republiés localement.
 */
export function createBridge(opts: BridgeOptions): Bridge {
  const factory = opts.socketFactory ?? browserSocketFactory;
  const reconnectMs = opts.reconnectMs ?? RECONNECT_MS;
  const intervalMs = opts.stateIntervalMs ?? STATE_INTERVAL_MS;
  const store = opts.runtime.ctx.store;
  const messageListeners = new Set<(m: ServerToDashboard) => void>();
  const statusListeners = new Set<(s: BridgeStatus) => void>();
  let socket: SocketLike | null = null;
  let status: BridgeStatus = 'disconnected';
  let closed = false;
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  let stateTimer: ReturnType<typeof setTimeout> | null = null;
  let lastStateAt = Number.NEGATIVE_INFINITY;

  const send = (m: SimToServer): boolean => {
    if (socket === null || socket.readyState !== OPEN) return false;
    socket.send(JSON.stringify(m));
    return true;
  };

  const sendState = (): void => {
    if (stateTimer !== null) {
      clearTimeout(stateTimer);
      stateTimer = null;
    }
    lastStateAt = Date.now();
    send({ type: 'state', state: store.get() });
  };

  /** Envoi immédiat si le dernier date de plus de 200 ms, sinon un seul envoi différé (le dernier état gagne). */
  const scheduleState = (): void => {
    if (stateTimer !== null) return;
    const wait = intervalMs - (Date.now() - lastStateAt);
    if (wait <= 0) {
      sendState();
      return;
    }
    stateTimer = setTimeout(sendState, wait);
  };

  const setStatus = (s: BridgeStatus): void => {
    if (status === s) return;
    status = s;
    for (const fn of statusListeners) fn(s);
  };

  const handleCommand = (m: ServerToSim): void => {
    if (m.type === 'apply_action') {
      send({ type: 'action_result', requestId: m.requestId, result: opts.runtime.apply(m.action) });
      sendState();
      return;
    }
    opts.renderViews(m.cameras).then(
      (result) => send({ type: 'views_result', requestId: m.requestId, result }),
      () => send({ type: 'views_result', requestId: m.requestId, result: emptyViews(store.get()) }),
    );
  };

  const onMessage = (raw: unknown): void => {
    const m = parseMessage(String(raw));
    if (m === null) return;
    if (m.type === 'apply_action' || m.type === 'render_views') handleCommand(m);
    else if (DASHBOARD_TYPES.has(m.type)) for (const fn of messageListeners) fn(m as ServerToDashboard);
  };

  const connect = (): void => {
    if (closed) return;
    reconnectTimer = null;
    const s = factory(opts.url);
    socket = s;
    s.onopen = () => {
      setStatus('connected');
      send({ type: 'hello', role: 'sim' });
      sendState();
    };
    s.onmessage = (ev) => onMessage(ev.data);
    s.onerror = () => undefined; // le navigateur enchaîne toujours par onclose
    s.onclose = () => {
      if (socket !== s) return;
      socket = null;
      setStatus('disconnected');
      if (!closed) reconnectTimer = setTimeout(connect, reconnectMs);
    };
  };

  const unsubscribeStore = store.subscribe(scheduleState);
  const unsubscribeEvents = opts.runtime.onEvent((event) => {
    send({ type: 'sim_event', event });
  });
  connect();

  return {
    onServerMessage(fn) {
      messageListeners.add(fn);
      return () => messageListeners.delete(fn);
    },
    status: () => status,
    onStatus(fn) {
      statusListeners.add(fn);
      return () => statusListeners.delete(fn);
    },
    close() {
      closed = true;
      if (reconnectTimer !== null) clearTimeout(reconnectTimer);
      if (stateTimer !== null) clearTimeout(stateTimer);
      unsubscribeStore();
      unsubscribeEvents();
      const s = socket;
      socket = null;
      s?.close();
      setStatus('disconnected');
    },
  };
}
```

- [ ] **Step 5: Écrire `fakeBridge.ts`**

`packages/sim/src/bridge/fakeBridge.ts` :

```ts
import type { ServerToDashboard } from '@tomato/shared';
import type { Bridge, BridgeStatus } from './bridge';

/** Une entrée de scénario : même forme que `messages[]` d'un journal d'épisode (`GET /episodes/:id`). */
export interface ScriptEntry {
  atMs: number;
  message: ServerToDashboard;
}

/**
 * Bridge simulé pour M7 (tests et replay) : rejoue `script` dans l'ordre des `atMs`, divisés par `speed`.
 * Se déclare connecté ; `close()` annule ce qui reste.
 */
export function createFakeBridge(script: readonly ScriptEntry[], speed = 1): Bridge {
  const listeners = new Set<(m: ServerToDashboard) => void>();
  const statusListeners = new Set<(s: BridgeStatus) => void>();
  let status: BridgeStatus = 'connected';
  const timers = [...script]
    .sort((a, b) => a.atMs - b.atMs)
    .map((entry) =>
      setTimeout(() => {
        for (const fn of listeners) fn(entry.message);
      }, entry.atMs / speed),
    );
  return {
    onServerMessage(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    status: () => status,
    onStatus(fn) {
      statusListeners.add(fn);
      return () => statusListeners.delete(fn);
    },
    close() {
      for (const t of timers) clearTimeout(t);
      if (status === 'disconnected') return;
      status = 'disconnected';
      for (const fn of statusListeners) fn('disconnected');
    },
  };
}
```

- [ ] **Step 6: Vérifier le succès**

Run: `npx vitest run packages/sim/src/bridge`
Expected: PASS, 8 tests (bridge 6, fakeBridge 2).

- [ ] **Step 7: Commit**

```bash
git add packages/sim/src/bridge
git commit -m "feat(sim): bridge WebSocket de la page sim (état 5 Hz, commandes, reconnexion) et bridge simulé pour M7"
```

---

### Task 15: Branchement du bridge dans `App.tsx`

**Files:**
- Modify: `packages/sim/src/App.tsx`

**Interfaces:**
- Produces: `window.__tomato = { runtime, renderViews?, bridge }` ; le bridge est créé juste après `createRuntime` et fermé par le nettoyage de `onReady` (StrictMode monte deux fois en dev : sans cette fermeture, deux clients `sim` se remplaceraient en boucle).

- [ ] **Step 1: Écrire `App.tsx`**

Contenu attendu si M1, M2 et M3 ne sont pas mergés :

`packages/sim/src/App.tsx` :

```tsx
import { useCallback } from 'react';
import { createDefaultWorld, type CameraId, type ViewsResult } from '@tomato/shared';
import { createBridge, type Bridge } from './bridge/bridge';
import { emptyViews } from './bridge/viewsFallback';
import { createRuntime, type SimRuntime } from './core/runtime';
import type { SimModule } from './core/module';
import { buildPlantMesh } from './plant/buildPlantMesh';
import { generatePlant } from './plant/generatePlant';
import { SpectatorView } from './three/SpectatorView';
import type { SceneHandle } from './three/createScene';

const SEED = 20260917;
/** Hub WebSocket du serveur (M5) ; la page réessaie toutes les 2 s tant que le serveur n'est pas lancé. */
const WS_URL = 'ws://localhost:7332';

/** Modules de la sim, dans l'ordre de dispatch des actions. Remplis par M1 (plant), M2 (robot), M3 (cameras). */
const MODULES: SimModule[] = [];

declare global {
  interface Window {
    __tomato?: { runtime: SimRuntime; renderViews?: (cameras: CameraId[]) => Promise<ViewsResult>; bridge?: Bridge };
  }
}

export function App() {
  const onReady = useCallback((scene: SceneHandle) => {
    // Plant statique de l'Étape 1 ; M1 le remplace par un module.
    scene.addObject(buildPlantMesh(generatePlant(SEED)));
    let stopFrames: (() => void) | null = null;
    let bridge: Bridge | null = null;
    void createRuntime(createDefaultWorld(SEED), scene, MODULES).then((runtime) => {
      window.__tomato = { runtime };
      // Le bridge lit `renderViews` à chaque demande : présent après le merge de M3, sinon vues sans image.
      bridge = createBridge({
        url: WS_URL,
        runtime,
        renderViews: (cameras) => window.__tomato?.renderViews?.(cameras) ?? Promise.resolve(emptyViews(runtime.ctx.store.get())),
      });
      window.__tomato = { ...window.__tomato, runtime, bridge };
      stopFrames = scene.onFrame((dt) => runtime.step(dt));
    });
    return () => {
      stopFrames?.();
      bridge?.close();
    };
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
```

Règles de fusion si `App.tsx` a déjà été modifié par M1/M2/M3 : (a) garder leurs imports, leur `MODULES` et leur affectation de `window.__tomato` (M3 : `window.__tomato = renderViews ? { runtime, renderViews } : { runtime }`) ; (b) ajouter les imports `createBridge`/`Bridge` et `emptyViews`, la constante `WS_URL` et le bloc `declare global` ci-dessus (union des propriétés `runtime`, `renderViews?`, `bridge?`) ; (c) juste après leur affectation de `window.__tomato`, insérer la création du bridge et `window.__tomato = { ...window.__tomato, runtime, bridge };` ; (d) la fonction de nettoyage renvoie `stopFrames?.(); bridge?.close();`. Rien d'autre ne change.

- [ ] **Step 2: Vérifier dans le navigateur**

Run: `npm run dev:server` (terminal 1, `TOMATO_AGENT=off`), `npm run dev:sim` (terminal 2), ouvrir http://localhost:5173.
Expected: le journal du serveur reste silencieux (pas d'erreur), `curl http://127.0.0.1:7331/health` renvoie `"simConnected":true` ; dans la console du navigateur, `window.__tomato.bridge.status()` → `'connected'`. Couper le serveur : `status()` passe à `'disconnected'` ; le relancer : `'connected'` en ≤ 2 s. Avec Claude Code : `claude mcp add --transport http tomato-robot http://localhost:7331/mcp` puis, dans une session, « appelle get_status » → le JSON du monde de la page ; « appelle get_views » → trois images si M3 est mergé, sinon le texte `not_available : … (aucune image)`.

- [ ] **Step 3: Lint, typecheck, build, capture**

Run: `npm run lint && npm run typecheck && npm run build && npm run shot`
Expected: exit 0 ; `data/shots/scene.png` produit (le bridge échoue silencieusement à se connecter pendant la capture : aucune `pageerror`).

- [ ] **Step 4: Commit**

```bash
git add packages/sim/src/App.tsx
git commit -m "feat(sim): création du bridge WebSocket après le runtime, window.__tomato.bridge"
```

---

### Task 16: Gates, checklist et PR

**Files:**
- Modify: `docs/superpowers/specs/2026-09-17-etape-3-m5-serveur-checklist.md` (cocher)
- Create: `data/build_verdict.json`

- [ ] **Step 1: Gates complets**

Run:
```bash
npm run lint && npm run typecheck && npm test && npm run build && npm run shot
```
Expected: les cinq commandes sortent en 0 ; Vitest rapporte 89 tests (shared 18, sim 21 dont bridge 8, server 50) plus ceux de M1/M2/M3 s'ils sont mergés ; `data/shots/scene.png` existe.

- [ ] **Step 2: Cocher la checklist**

Cocher chaque `[SPEC-N]`, `[TEST-N]`, `[GATE-N]` de `docs/superpowers/specs/2026-09-17-etape-3-m5-serveur-checklist.md` avec la sortie fraîche sous les yeux. Un item non réalisable → ne pas cocher, rendre `failed` avec `items_skipped`.

```bash
git add docs/superpowers/specs/2026-09-17-etape-3-m5-serveur-checklist.md
git commit -m "docs(server): checklist M5 cochée"
```

- [ ] **Step 3: PR**

```bash
git push -u origin feat/5-m5-serveur
gh pr create --base main --title "feat(server): MCP streamable HTTP, hub WebSocket, phases, journal, replay (M5)" --body "Closes #5

Checklist: docs/superpowers/specs/2026-09-17-etape-3-m5-serveur-checklist.md
Plan: docs/superpowers/plans/2026-09-17-etape-3-m5-serveur.md

## Gates
lint: pass · typecheck: pass · test: pass (89 tests) · build: pass · shot: pass (data/shots/scene.png)

🤖 Generated with [Claude Code](https://claude.com/claude-code)"
gh issue edit 5 --remove-label todo --remove-label in-progress --add-label in-review
```

Puis écrire `data/build_verdict.json` selon `.claude/agents/builder.md` (`status: "pr_created"`, numéro de PR, branche, `items_skipped: []`, `plan_deviations` réelles, gates).

---

## Auto-revue du plan

**Couverture du contrat Étape 3, section par section :** Processus et ports : 7331 (`/mcp`, `/health`, `/episodes`), 7332 (hub), scripts `dev:server` / `dev` / `start` / `typecheck` / `build` (Tasks 1, 11, 12). Hub : `createHub(port) → Hub` avec les cinq méthodes du contrat, `hello` obligatoire, un seul client `sim` qui remplace l'ancien, diffusion à TOUS, `snapshot` à la connexion, `parseMessage`, messages inconnus ignorés et journalisés (Task 5). Pont : `createSimBridge(hub) → SimBridge`, `requestId` par `crypto.randomUUID()`, délai 15 s → `fail(latestState ?? createDefaultWorld(0), 'not_available', 'simulation did not answer')`, même erreur immédiate sans sim, dernier `state` mémorisé (Task 6). État de session : `SessionState` aux sept champs du contrat, `Session` avec `get / setPhase / startEpisode / endEpisode / onPhase`, `transition` de shared (erreur journalisée, jamais lancée), diffusion `phase` + `block_activity`, règles `ripe_detected` → `detected` + `set_target` + réveil, premier mouvement → `harvesting`, `cut` réussi → `cutting` puis `falling`, `tomato_landed` → `harvested`/`missed`, `report` → `idle` (via `aborted` si abandon), file d'attente hors `idle` rejouée au retour en `idle` (Tasks 3, 7). Journal : `data/episodes/<episodeId>.json` avec `{ episodeId, tomatoId, startedAt, endedAt, outcome, note, messages: [{ atMs, message }], toolCalls, costUsd }`, images des `views` conservées, `GET /episodes` et `GET /episodes/:id` (Tasks 4, 11). MCP : `createMcpServer(deps)` avec les neuf outils, noms et descriptions de `TOOL_DESCRIPTIONS`, schémas de `ToolSchemas`, transport streamable HTTP sur Express `/mcp` en mode sans session (choix documenté), `tool_call_start` → exécution → `tool_call_result` avec `durationMs` et résumé français, compteur et garde `MAX_TOOL_CALLS_PER_EPISODE` (tout outil sauf `report`), formats de retour de `get_status`, `get_views` (en-tête « Vue front — axes X→ Z↑ — 8 px/cm » + image + JSON), mouvements (`ActionResult` en texte, image rafraîchie pour `move_camera`), `cut`, `report`, `episodeId ?? 'manual'`, erreurs de validation en texte `invalid_argument` (Tasks 8, 9, 10). Point d'entrée : hub, bridge, session, journal, MCP + Express, runner (crochet M6), `TOMATO_MCP_PORT`, `TOMATO_WS_PORT`, `TOMATO_MODEL` (défaut `claude-opus-5`), `TOMATO_AGENT` (`on`/`off`) (Tasks 2, 12). Pont côté sim : `createBridge({ url, runtime, renderViews }) → Bridge` avec `onServerMessage / status / onStatus / close`, `hello { role: 'sim' }`, `state` limité à 5 Hz et après chaque `action_result`, `sim_event`, `apply_action` → `action_result`, `render_views` → `views_result`, reconnexion 2 s ; `createFakeBridge(script) → Bridge` (Task 14) ; `App.tsx` et `window.__tomato.bridge` (Task 15). Vérification de fin d'étape : `episode.test.ts` monte hub + bridge + session + MCP avec une sim scriptée sur un vrai WebSocket, le script `get_views → move_basket → move_scissors ×3 → open_scissors → cut → report` aboutit en `harvested`, panier mal placé → `missed`, journal écrit (Task 13). Spec section 8 : chaque outil renvoie la forme attendue (Tasks 9, 10), aucune exception vers l'agent, tests unitaires purs pour les règles et le formatage.

**Scan des placeholders :** aucun `TODO`, aucun « similaire à », aucun code tronqué ; chaque fichier de la structure a son contenu complet dans une tâche ; tout le code a été extrait dans une copie de travail des packages, installé avec les versions épinglées et validé par `tsc --noEmit` (server et sim), `eslint` et `vitest` (89 tests verts, dont le démarrage réel du serveur par `tsx` et un aller-retour MCP par le transport HTTP du SDK).

**Cohérence des types :** `ContentBlock` (texte / image PNG) est directement assignable à `CallToolResult.content` du SDK ; `registerTool` reçoit `ToolSchemas[name]` (ZodObject v3, accepté comme `AnySchema`) et le callback est typé `unknown` puis revalidé par `safeParse` ; `ToolOutcome.after` est optionnel (jamais `undefined` explicite, `exactOptionalPropertyTypes`) ; `SimAction` ne reçoit jamais `dx: undefined` (`definedNumbers`) ; `ViewsResult` sans image = signal d'indisponibilité (le contrat ne prévoit pas d'erreur pour les vues) ; `Snapshot = Extract<ServerToDashboard, { type: 'snapshot' }>` ; `Hub.close()` renvoie `Promise<void>` (un consommateur qui l'ignore reste correct) ; `Session.startEpisode` renvoie `string | null` ; `WakeEvent` est défini dans `state/session.ts` et réutilisé par `agentRunner.ts` ; le cast `as Transport` n'apparaît que dans `http/app.ts` et `http/app.test.ts` avec son commentaire ; `SocketLike` du bridge sim est un sous-ensemble structurel adapté par `browserSocketFactory` (les types DOM `onmessage` ne sont pas directement assignables) ; `ScriptEntry` a exactement la forme de `JournalEntry` du serveur, ce qui permet à M7 de rejouer `record.messages` tel quel.

**Décisions à relayer à M6 et M7 (pas de changement de `shared`) :** (1) M6 exporte `createAgentRunner` depuis `packages/server/src/agent/index.ts` (chargé dynamiquement par `index.ts`) et branche `session.onWake` lui-même s'il ne passe pas par `index.ts` ; (2) M6 diffuse `episode_start` et `episode_end` (le journal patche `costUsd` depuis l'`episode_end` tardif) ; M5 ne diffuse jamais ces deux messages ; (3) `Session` offre en plus `handleSimEvent`, `noteToolCall`, `noteToolResult`, `onWake`, `pendingDetections` ; `Hub` offre `onBroadcast`, `setSnapshot`, `whenListening` ; (4) `createFakeBridge(script, speed)` : `speed` divise les délais ; (5) en mode manuel (pas d'épisode), `episodeId` des messages vaut `'manual'`, le compteur d'appels ne s'applique pas et `report` répond « aucun épisode en cours ».

**Points d'attention à l'exécution :** (1) si `npm install` tire une autre version du SDK, épingler `1.30.0` explicitement (les API vérifiées sont celles-là) ; (2) le serveur se lie à `127.0.0.1` : les URL `localhost` fonctionnent avec Node ≥ 20 (`autoSelectFamily`) et Chrome, qui essaient les deux familles d'adresses ; si un client n'atteint pas `localhost`, utiliser `127.0.0.1` dans l'URL ; (3) les tests du hub et d'intégration ouvrent de vrais ports éphémères : un pare-feu Windows qui bloque `node.exe` sur la boucle locale les fait échouer, autoriser Node ; (4) `res.on('close')` ferme le transport et le serveur MCP de la requête ; ne pas réutiliser une instance entre requêtes (le SDK le refuse en mode sans session) ; (5) `StrictMode` monte `App` deux fois en dev : la fermeture du bridge dans le nettoyage de `onReady` évite deux clients `sim` ; (6) `prefer-const` est actif via typescript-eslint : pas de `let` jamais réassigné.
