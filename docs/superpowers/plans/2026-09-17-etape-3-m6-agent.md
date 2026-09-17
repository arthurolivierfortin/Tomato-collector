# Étape 3 — M6 Runner d'agent : plan d'implémentation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Réveiller un agent Claude (Claude Agent SDK TypeScript) à chaque tomate mûre détectée, lui donner le serveur MCP `robot` de M5 comme seul outil, un prompt système complet, une reprise de session entre épisodes, une file de réveils (un épisode à la fois), et convertir son flux en messages `episode_start` / `agent_text` / `episode_end` pour le dashboard ; plus un script `npm run wake -- <tomatoId>` de réveil manuel pour le tournage et le débogage.

**Architecture:** Tout le module vit dans `packages/server/src/agent/` et `packages/server/prompts/`. Le runner (`agentRunner.ts`) ne connaît M5 que par des interfaces structurelles minimales (`AgentHub`, `AgentSession`, `AgentSim` dans `types.ts`) compatibles avec `Hub`, `Session`, `SimBridge` de l'architecture de l'Étape 3 ; `query()` du SDK est injectable, donc tout est testable sans réseau. Un convertisseur pur (`streamToDashboard.ts`) réduit les messages du SDK en messages dashboard et en état d'épisode ; un constructeur pur (`wakePrompt.ts`) fabrique le message de réveil ; `queryOptions.ts` fabrique les options du SDK (noms vérifiés sur le `.d.ts` réel) ; `wakeServer.ts` expose `POST /wake/<tomatoId>` sur un port dédié (7333) pour ne pas dépendre de l'Express de M5 ; `startAgent.ts` branche le tout dans `index.ts` en cinq lignes.

**Tech Stack:** Node 22, TypeScript 5 strict (`exactOptionalPropertyTypes`, `noUncheckedIndexedAccess`), ESLint (`consistent-type-imports`, `no-explicit-any`), Vitest 3 (Node), `@anthropic-ai/claude-agent-sdk` 0.3.275 (binaire Claude Code 2.1.275 embarqué, pas d'installation séparée), `ws` 8 (client WebSocket du script `wake`), `tsx` (exécution des scripts).

**Spec:** `docs/superpowers/specs/2026-09-17-tomato-harvest-demo-design.md` (sections 1, 3, 4.5, 5 « Runner d'agent » et « Prompt système », 8, 9, 11). **Contrat :** `docs/superpowers/plans/2026-09-17-etape-3-architecture.md` (section « Runner d'agent (M6) » ; « Serveur (M5) » pour `Hub`, `Session`, `SimBridge`). **Checklist :** `docs/superpowers/specs/2026-09-17-etape-3-m6-agent-checklist.md`. **Issue :** #6.

## Global Constraints

- Windows 11 sans toolchain native : Node 22, npm, TypeScript seulement. Le SDK embarque son binaire via la dépendance optionnelle `@anthropic-ai/claude-agent-sdk-win32-x64` ; ne jamais installer avec `--omit=optional`.
- Unités partout : centimètres et degrés. Repère monde : X droite, Y arrière, Z haut, origine au pied du plant.
- Périmètre des fichiers : `packages/server/src/agent/**`, `packages/server/prompts/**`, `packages/server/scripts/wake.ts`, `packages/server/package.json`, `packages/server/tsconfig.json` (ajout de `scripts` à `include`), `packages/server/src/index.ts` (branchement). **Aucun fichier dans `packages/shared`** ; si un besoin apparaît, s'arrêter en `blocked`.
- Fichiers < 200 lignes, pas de `any`, ESM, `import type` pour les types.
- Gates par PR : `npm run lint`, `npm run typecheck`, `npm test`, `npm run build`, plus la vérification manuelle `[GATE-5]` (transcript d'un épisode dans `data/episodes/`).
- Variables d'environnement : `TOMATO_MODEL` (défaut `claude-opus-5`), `TOMATO_AGENT` (`on`/`off`, défaut `on`), `TOMATO_WAKE_PORT` (défaut 7333), `TOMATO_WS_PORT` (7332, lu par le script `wake`), `TOMATO_MCP_PORT` (7331, lu par `index.ts` de M5).
- Authentification : le binaire embarqué lit les mêmes identifiants que le Claude Code interactif de la machine (`~/.claude/.credentials.json`, présent ici) ; `ANTHROPIC_API_KEY` dans l'environnement du serveur prend le dessus. Aucune clé n'est écrite dans le dépôt.

## Décisions de conception (vérifiées, voir l'auto-revue pour les sources)

| Sujet | Décision | Raison |
|---|---|---|
| Permissions | `permissionMode: 'dontAsk'` + `allowedTools: ['mcp__robot__*']` + `tools: []` | La doc recommande `allowedTools` + `dontAsk` pour un agent verrouillé : aucune invite possible, tout ce qui n'est pas pré-approuvé est refusé ; `tools: []` retire tous les outils intégrés (Bash, Read…) ; `bypassPermissions` approuverait *tout* et exigerait `allowDangerouslySkipPermissions`. |
| Isolation | `settingSources: []`, `strictMcpConfig: true` | Le `.claude/` du dépôt (hooks, settings, CLAUDE.md, `.mcp.json`) ne doit pas fuir dans l'agent de récolte. |
| Outils MCP au tour 1 | `alwaysLoad: true` sur le serveur `robot` | Neuf outils seulement : pas de « tool search » différé, les schémas sont dans le prompt dès le premier tour. |
| Images | `env.MAX_MCP_OUTPUT_TOKENS = '400000'` | Les résultats MCP contenant des images restent soumis à cette limite (défaut 25 000 tokens) ; trois PNG 800×800 en base64 la dépassent. |
| Texte pour le dashboard | Un `agent_text` par bloc de texte **complet** (message `assistant`) ; les `stream_event` (`text_delta`) ne vont qu'à la console | « Texte agrégé par bloc » du contrat ; `ServerToDashboard.agent_text` n'a pas d'indicateur partiel/final, des deltas spammeraient la trace M7. |
| Session | `resume: <session_id du result>` à partir du deuxième épisode ; en cas d'erreur sur une reprise, la session est oubliée et le suivant repart à neuf | Mémoire entre épisodes (spec) sans blocage si le transcript a disparu. |
| Réveil manuel | Mini serveur `node:http` sur 7333 (`POST /wake/<id>`) + script qui suit l'épisode sur le WebSocket du hub (rôle `dashboard`) | Indépendant de la structure d'`index.ts` / Express de M5 ; le transcript vient des vrais messages diffusés. |
| Tours max | `maxTurns: 50` | 40 appels d'outils (limite MCP de M5) + tours de texte seul + `report`. |

## Hypothèses sur M5 (à vérifier au branchement, Task 8)

1. `Session.startEpisode(tomatoId)` pose `episodeId` (lisible par `session.get().episodeId`), passe en `detected` et envoie `set_target` à la sim. Le runner appelle `startEpisode` **seulement si** `session.get().episodeId === null` (donc pas de double démarrage si M5 l'a déjà fait sur `ripe_detected`).
2. `Session.endEpisode(outcome, note)` clôt le journal et remet `episodeId` à `null`. Le runner diffuse `episode_end` **avant** d'appeler `endEpisode` (si l'épisode est encore ouvert) pour que le journal capture le message. Si le tool `report` de M5 appelle déjà `endEpisode`, l'`episode_end` du runner arrive après la clôture du journal : le builder le note dans `plan_deviations` et ouvre une issue `ad-hoc` (« journal : horodater `episode_end` après `report` »). Le runner est le **seul** émetteur d'`episode_end` ; M5 ne doit pas le diffuser aussi.
3. `Session.onPhase(fn)` appelle `fn(phase, …)` à chaque changement ; M6 n'utilise que le premier argument.
4. `SimBridge.latestState()` renvoie le dernier `WorldState` ou `null`.
5. Les `tool_call_start` / `tool_call_result` sont diffusés par le MCP de M5 ; le runner ne les émet pas (pas de doublons).
6. Le serveur MCP est nommé `robot` côté SDK (`mcpServers: { robot: … }`) : les outils vus par le modèle s'appellent `mcp__robot__<tool>`.

---

## Structure de fichiers

```
packages/server/
  package.json                          + deps @anthropic-ai/claude-agent-sdk, ws ; devDeps @types/ws, tsx ; script wake
  tsconfig.json                         include: ["src", "scripts"]
  prompts/system.md                     prompt système complet (anglais)
  scripts/wake.ts                       point d'entrée `npm run wake -- <tomatoId>`
  src/index.ts                          + 5 lignes : startAgent si TOMATO_AGENT !== 'off'
  src/agent/types.ts                    WakeEvent, AgentHub, AgentSession, AgentSim, AgentMessage, QueryFn, AgentRunner
  src/agent/sdkQuery.ts                 adaptateur query() réel + vérification de forme à la compilation
  src/agent/streamToDashboard.ts        réduction pure du flux SDK → messages dashboard + état d'épisode
  src/agent/wakePrompt.ts               message de réveil + résumé de l'état sim
  src/agent/systemPrompt.ts             lecture de prompts/system.md
  src/agent/queryOptions.ts             options de query() (noms vérifiés)
  src/agent/agentRunner.ts              createAgentRunner : file, un épisode à la fois, reprise, abort, stop
  src/agent/wakeServer.ts               POST /wake/<id>, GET /wake (node:http, port 7333)
  src/agent/startAgent.ts               branchement : runner + onPhase('detected') + wake server + env
  src/agent/wakeCli.ts                  logique du script wake (WebSocket dashboard, transcript)
  src/agent/*.test.ts                   tests Vitest Node de chaque fichier ci-dessus
data/episodes/wake-<id>-<horodatage>.log   transcript console (preuve de GATE-5, non suivi par git)
```

---

### Task 1: Dépendances, script `wake`, prompt système

**Files:**
- Modify: `packages/server/package.json`, `packages/server/tsconfig.json`
- Create: `packages/server/prompts/system.md`, `packages/server/src/agent/systemPrompt.ts`, `packages/server/src/agent/systemPrompt.test.ts`

**Interfaces:**
- Produces: `loadSystemPrompt(): string`, `SYSTEM_PROMPT_URL: URL`.

- [ ] **Step 1: Installer les dépendances et déclarer le script**

Run (à la racine du worktree) :
```bash
npm install -w @tomato/server @anthropic-ai/claude-agent-sdk@^0.3.275 ws@^8
npm install -w @tomato/server -D @types/ws tsx
npm pkg set -w @tomato/server scripts.wake="tsx scripts/wake.ts"
```
Expected: `npm ls @anthropic-ai/claude-agent-sdk -w @tomato/server` affiche `0.3.275` (ou plus récent en 0.3.x) avec `zod@4.x` imbriqué sous le SDK et `zod@3.25.x` conservé pour `@tomato/shared` (pas d'ERESOLVE : vérifié) ; `node_modules/@anthropic-ai/claude-agent-sdk-win32-x64/claude.exe --version` répond `2.1.275 (Claude Code)` ou plus.

`packages/server/package.json` attendu (M5 peut avoir ajouté `dev`, `start`, `express`, `@modelcontextprotocol/sdk` : les conserver) :

```json
{
  "name": "@tomato/server",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "scripts": {
    "typecheck": "tsc --noEmit",
    "build": "tsc --noEmit",
    "wake": "tsx scripts/wake.ts"
  },
  "dependencies": {
    "@anthropic-ai/claude-agent-sdk": "^0.3.275",
    "@tomato/shared": "*",
    "ws": "^8.21.3"
  },
  "devDependencies": {
    "@types/node": "^26.6.1",
    "@types/ws": "^8.18.1",
    "tsx": "^4.23.13"
  }
}
```

`packages/server/tsconfig.json` :

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": { "noEmit": true, "types": ["node"] },
  "include": ["src", "scripts"]
}
```

- [ ] **Step 2: Test du chargeur de prompt (échoue)**

`packages/server/src/agent/systemPrompt.test.ts` :

```ts
import { describe, expect, it } from 'vitest';
import { MAX_TOOL_CALLS_PER_EPISODE, TOOL_NAMES } from '@tomato/shared';
import { loadSystemPrompt } from './systemPrompt';

describe('system prompt', () => {
  const prompt = loadSystemPrompt();

  it('is a substantial English document that names every tool', () => {
    expect(prompt.length).toBeGreaterThan(6000);
    for (const tool of TOOL_NAMES) expect(prompt).toContain(`\`${tool}\``);
  });

  it('states the frame, the units, the three views and the overlay glossary', () => {
    expect(prompt).toContain('X to the right, Y towards the back');
    expect(prompt).toContain('centimetres and degrees');
    for (const view of ['`top`', '`front`', '`side`']) expect(prompt).toContain(view);
    for (const word of ['tige cible', 'lame', 'normale', 'panier', 'impact', 'occultée', 'PIVOTÉE']) {
      expect(prompt).toContain(word);
    }
  });

  it('states the cut rule, the step sizes, the call limit and the reasoning requirement', () => {
    expect(prompt).toContain('0.6 cm');
    expect(prompt).toContain('45 degrees');
    expect(prompt).toContain('5 cm steps, then 1 cm steps');
    expect(prompt).toContain(`at most ${MAX_TOOL_CALLS_PER_EPISODE} tool calls`);
    expect(prompt).toContain('Before every tool call, write one to three short sentences');
  });
});
```

Run: `npx vitest run packages/server/src/agent/systemPrompt.test.ts`
Expected: FAIL, module `./systemPrompt` introuvable.

- [ ] **Step 3: Écrire le prompt système**

`packages/server/prompts/system.md` (texte intégral, en anglais ; les étiquettes des overlays de M3 sont en français, d'où le glossaire) :

````markdown
# Tomato harvesting agent

You are the control agent of a small harvesting robot in a simulated greenhouse. Your only way to act is the nine tools of the `robot` MCP server. Everything else in your environment is switched off: no files, no shell, no web. You are woken up once per ripe tomato; each wake-up is one episode, and every episode ends with a call to `report`.

You have no eyes of your own. You look at the scene through three orthographic camera views that are formatted for you: dark background, white contours, a centimetre grid, axis labels, a scale bar and line drawings of the tools. Read them like technical drawings. Every number you need is also in the JSON block that comes with the images and in `get_status`; when a number is available, use the number, not your estimate from the image.

## World frame and units

- Units are centimetres and degrees everywhere, in what you read and in what you send.
- World frame: X to the right, Y towards the back (depth, away from the front camera), Z up. Origin at the base of the plant, on the ground.
- The plant grows around the origin. The arm base is at positive X and negative Y (right of the plant and in front of it). The reach of the arm, the basket rail and the camera rails are in `limits` of the JSON and of `get_status`.

## The three views

| View | Looks along | Image horizontal | Image vertical | Camera moves on rails |
|---|---|---|---|---|
| `top` | -Z (from above) | X, increasing to the right | Y, increasing upwards | X, Y, Z (height) |
| `front` | +Y (from the front, y < 0) | X, increasing to the right | Z, increasing upwards | X, Z, Y (backing off) |
| `side` | -X (from the right, x > 0) | Y, increasing to the right | Z, increasing upwards | Y, Z, X (backing off) |

Rules that follow from orthographic projection:

- One centimetre is the same number of pixels everywhere in a view (`px_per_cm` in the header band). The grid and the scale bar apply to the tomato, the scissors and the basket alike. Nothing looks smaller because it is farther away.
- Each view hides one axis: `top` hides Z, `front` hides Y, `side` hides X. To place a point in 3D you need two views. To measure a distance along Y, use `top` or `side`, never `front`.
- A camera can pivot up to 25 degrees (yaw, tilt) to look around a leaf. When it is pivoted, the header band says so (`PIVOTÉE`) and the grid stays aligned with the world axes, so coordinates read on the grid remain world coordinates.

## Reading the overlays

The overlay labels are in French. Glossary: `VUE` = view, `tige cible` = target stem, `ciseaux` = scissors, `lame` = blade axis, `normale` = blade normal, `lacet` = yaw, `tangage` = pitch, `roulis` = roll, `ouverture` = opening, `panier` = basket, `impact` = predicted impact point, `occultée` = occluded.

1. Background: the rendered scene darkened to 35 % with white edge contours. Leaves, stems and fruit appear as white outlines.
2. Grid: thin lines every 1, 2, 5, 10 or 20 cm (the spacing is written in the header band), with the world axes slightly brighter. Values in cm are written in the bottom margin (horizontal axis) and the left margin (vertical axis). A scale bar sits at the bottom left.
3. Tomato markers: one numbered circle per tomato, centred on the fruit, green (unripe), orange (turning) or red (ripe), with the label `#id state (x, y, z)` in cm. A badge `occultée NN %` means the fruit is mostly hidden in this view; the position is still exact because it comes from the simulation. A cyan ring marks the target.
4. Target stem: a short cyan segment from the branch to the fruit, labelled `tige cible`. In the JSON it is `stem.fromCm` (branch end) to `stem.toCm` (fruit end). This is where you cut.
5. Scissors: magenta drawing. A dot at the pivot, two lines for the blades, a cross at the cut point. Two short arrows from the cut point: magenta `lame` is the blade axis (from the pivot towards the tips, the direction of the cut), light blue `normale` is the blade normal (perpendicular to the plane of the blades). Text: `ciseaux lacet … tangage … roulis … ouverture …`.
6. Basket: yellow rectangle (top view) or open box (front and side), a yellow cross at its centre, text `panier (x, y) z=…`. The basket is 20 by 20 cm and 10 cm deep; its floor is at the z written in the label.
7. Fall line: a white dashed line from the target fruit straight down to the plane of the basket floor, ending in a yellow circle labelled `impact (x, y)`. A cut tomato falls vertically, so the impact point has the same X and Y as the fruit. In `top` the fall line is reduced to a point.
8. Header band: view name, visible axes, camera position, yaw and tilt, `px/cm`, grid spacing, simulation time, `PIVOTÉE` when the camera is pivoted.

## Scissors geometry and the cut rule

- The cut point is the point between the blades where the stem is cut. `move_scissors` moves the cut point; `rotate_scissors` rotates the blades around it.
- Blades are 6 cm long; the pivot sits 3 cm behind the cut point along the blade axis. `open_scissors` opens them to 60 degrees; `cut` closes them.
- Orientation yaw = pitch = roll = 0 gives blade axis `[-1, 0, 0]` (blades pointing towards -X, from the arm base towards the plant) and blade normal `[0, 0, 1]` (the plane of the blades is horizontal). Yaw rotates around world Z (turns the blade axis in the horizontal plane), pitch rotates around the transverse axis (tilts the blade axis up or down and the normal forwards or backwards), roll rotates around the blade axis (tilts the normal sideways). The current `blade_axis` and `blade_normal` unit vectors are in the JSON: trust them.
- `cut` succeeds (`stem_cut`) when both conditions hold: the target stem passes within 0.6 cm of the cut segment, and the angle between the stem direction and the blade normal is below 45 degrees (equivalently, the cut line is more than 45 degrees away from the stem: the stem crosses the plane of the blades instead of lying in it).
- Practical consequence: stems are tilted between 0 and 60 degrees from vertical. With the default horizontal blade plane (normal = Z) any stem tilted less than 45 degrees from vertical already satisfies the angle condition; you only need to bring the cut point onto the stem. For a steeply tilted stem, compute its direction `d = normalize(toCm - fromCm)` from the JSON and tilt the normal towards `d` with pitch or roll before the final approach.
- How to verify before cutting: in the view where the stem shows its full length (the view whose hidden axis is roughly perpendicular to the stem), the blades should appear as a line crossing the stem at a wide angle, ideally perpendicular. In the two other views the cross of the cut point must sit on the cyan stem line, within one grid cell of 1 cm. Numerically: the distance from `cut_point_cm` to the segment `fromCm` to `toCm` must be under 0.6 cm.
- Aim for the middle of the stem segment, `(fromCm + toCm) / 2`. Cutting right against the fruit or against the branch fails more often.

## Movement, obstacles and the basket

- `move_scissors` refuses a move whose straight path passes within 0.5 cm of the surface of any tomato or of the main stem; it returns `collision` with the blocking position `atX, atY, atZ`. Leaves and pedicels bend and are never obstacles. Go around an obstacle in two legs (for example up and over, or sideways then in), never by pushing through.
- `out_of_reach` means the point is beyond the arm reach or too low (below 5 cm). Approach the plant from its right or front side, where the arm base is.
- Steps: about 5 cm while the cut point is more than 10 cm from the stem, then 1 cm for the last centimetres. Look at the views between steps; the closer you are, the more you look. When the tools are near the target, zoom the cameras (`zoom` 2 or 3) and slide them so that both the stem and the cut point stay in frame.
- `move_basket` places the basket centre on its rail under the plant. Put the centre on the predicted `impact (x, y)` of the target, that is on the X and Y of the fruit, before cutting. The rectangle is 20 by 20 cm, so a fruit whose X or Y is more than about 8 cm from the basket centre may miss. Move the basket first: it is the cheapest call and it never collides.
- Absolute mode is best for the basket and for coarse scissors moves; relative mode is best for 1 cm refinements.

## Recommended closed-loop procedure

1. `get_views` once, all three cameras. Identify the target (cyan ring, the id given in the wake-up message), read its position, its stem endpoints and `visible_in`. If a view shows it occluded, move or pivot that camera before relying on that view.
2. `move_basket` in absolute mode to the X and Y of the target.
3. Plan the approach: the middle of the stem is the goal for the cut point. Choose an approach direction that keeps the path away from other tomatoes and from the main stem, coming from the side of the arm base.
4. Move the scissors in 5 cm steps, then 1 cm steps, checking a view after each step (`move_camera` returns a refreshed view of that camera and is enough for one-view checks). Correct the orientation with `rotate_scissors` when the stem is tilted.
5. When the cut point is within about 3 cm of the stem, `open_scissors`, then finish the approach in 1 cm steps so that the stem enters between the blades.
6. Verify in the three views as described above, then `cut`.
7. If `cut` fails, read the returned code and measurements (`misaligned` gives the distance in cm and the angle in degrees; `nothing_between_blades` means the stem is not within reach of the blades; `leaf_cut` means a leaf is between the blades and the stem is not). Correct by the measured amount and try again. Do not repeat the same command twice in a row.
8. After `stem_cut`, the tomato falls for a few seconds of simulated time. Call `get_status` until the last event is `tomato_landed`; `inBasket: true` means harvested, `false` means missed. Two or three calls at most.
9. `report` with the outcome (`harvested`, `missed`, or `aborted` when you could not finish) and a one-sentence note: what happened and what you would do differently. This is always your last call.

## Errors and limits

- Tools never throw. Every error is a short text with a code and measurements: `out_of_reach`, `collision`, `out_of_rail`, `nothing_between_blades`, `leaf_cut`, `misaligned`, `invalid_argument`, `not_available`. Read the numbers and adjust; do not guess.
- `not_available` means the simulation did not answer. Retry once, and if it persists `report` with `aborted`.
- Budget: at most 40 tool calls per episode, `report` included. `get_views` counts as one call whatever the number of cameras. After the limit, every tool except `report` answers that the limit is reached; then report immediately with what you know. A good episode takes 12 to 20 calls: look, basket, four to eight approach moves, one or two rotations, open, cut, one or two status checks, report.
- If the arm is stuck (repeated `collision` from every direction) or the target cannot be seen in any view after moving the cameras, report `aborted` with the reason rather than burning the budget.

## How to reason and write

Before every tool call, write one to three short sentences: what you read (with the numbers, one decimal), what you are about to do, and why. No headings, no lists, no long analysis. Numbers are in cm and degrees. Do not narrate the tool result back; use it.

Your memory across episodes is not reliable: the plant may have been regenerated and every position may have changed. At the start of an episode, look before you act, and never reuse coordinates from a previous episode.
````

`packages/server/src/agent/systemPrompt.ts` :

```ts
import { readFileSync } from 'node:fs';

/** Chemin du prompt système, relatif à ce module : `packages/server/prompts/system.md`. */
export const SYSTEM_PROMPT_URL = new URL('../../prompts/system.md', import.meta.url);

/** Lit le prompt système complet (texte brut, sans substitution). */
export function loadSystemPrompt(): string {
  return readFileSync(SYSTEM_PROMPT_URL, 'utf8');
}
```

- [ ] **Step 4: Vérifier le succès**

Run: `npx vitest run packages/server/src/agent/systemPrompt.test.ts`
Expected: PASS, 3 tests.

- [ ] **Step 5: Commit**

```bash
git add packages/server/package.json packages/server/tsconfig.json package-lock.json packages/server/prompts packages/server/src/agent/systemPrompt.ts packages/server/src/agent/systemPrompt.test.ts
git commit -m "feat(agent): dépendance Claude Agent SDK, script wake, prompt système complet"
```

---

### Task 2: Types du module et adaptateur `query()` (vérification de forme à la compilation)

**Files:**
- Create: `packages/server/src/agent/types.ts`, `packages/server/src/agent/sdkQuery.ts`

**Interfaces:**
- Produces: `WakeEvent`, `EpisodeOutcome`, `AgentHub`, `AgentSession`, `AgentSessionState`, `AgentSim`, `AgentContentBlock`, `AgentMessage`, `QueryFn`, `AgentRunner`, `toAgentMessage(m: SDKMessage): AgentMessage`, `sdkQuery: QueryFn`.
- Consumes: `Options`, `SDKMessage` de `@anthropic-ai/claude-agent-sdk` ; `Phase`, `ServerToDashboard`, `Vec3`, `WorldState` de `@tomato/shared`.

Pas de test Vitest pour cette tâche : la vérification est `tsc`. `toAgentMessage` renvoie `m` tel quel dans chaque branche ; cela ne compile que si `SDKAssistantMessage`, `SDKResultMessage`, `SDKPartialAssistantMessage` et `SDKSystemMessage` (init) sont des sur-types structurels des variantes d'`AgentMessage`. C'est ainsi que les « formes vérifiées » des tests de la Task 3 sont garanties contre le `.d.ts` réel du SDK installé.

- [ ] **Step 1: Écrire `types.ts`**

```ts
import type { Options } from '@anthropic-ai/claude-agent-sdk';
import type { Phase, ServerToDashboard, Vec3, WorldState } from '@tomato/shared';

export type EpisodeOutcome = 'harvested' | 'missed' | 'aborted';

/** Événement de réveil : la tomate mûre détectée. */
export interface WakeEvent {
  tomatoId: number;
  positionCm: Vec3;
  ripeness: number;
}

/** Sous-ensemble structurel du `Hub` de M5 consommé par le runner. */
export interface AgentHub {
  broadcast(m: ServerToDashboard): void;
}

/** Sous-ensemble structurel de `SessionState` / `Session` de M5. */
export interface AgentSessionState {
  phase: Phase;
  episodeId: string | null;
  targetTomatoId: number | null;
}

export interface AgentSession {
  get(): AgentSessionState;
  startEpisode(tomatoId: number): unknown;
  endEpisode(outcome: EpisodeOutcome, note: string): unknown;
  onPhase(fn: (phase: Phase) => void): unknown;
}

/** Sous-ensemble structurel du `SimBridge` de M5. */
export interface AgentSim {
  latestState(): WorldState | null;
}

/** Bloc de contenu d'un message assistant, réduit aux champs lus par M6. */
export interface AgentContentBlock {
  type: string;
  text?: string;
  id?: string;
  name?: string;
  input?: unknown;
}

/**
 * Messages du flux `query()` du Claude Agent SDK, réduits aux champs lus par M6.
 * Chaque variante est un sous-type structurel du `SDKMessage` correspondant
 * (vérifié par `toAgentMessage` dans `sdkQuery.ts`, qui ne compile que si c'est vrai).
 */
export type AgentMessage =
  | {
      type: 'system';
      subtype: 'init';
      session_id: string;
      model: string;
      mcp_servers: ReadonlyArray<{ name: string; status: string }>;
      apiKeySource: string;
    }
  | { type: 'assistant'; message: { content: ReadonlyArray<AgentContentBlock> } }
  | { type: 'stream_event'; event: { type: string; delta?: unknown } }
  | {
      type: 'result';
      subtype: string;
      is_error: boolean;
      total_cost_usd: number;
      duration_ms: number;
      num_turns: number;
      session_id: string;
    }
  | { type: 'other' };

/** `query()` du SDK, injectable (les tests passent un générateur asynchrone factice). */
export type QueryFn = (prompt: string, options: Options) => AsyncIterable<AgentMessage>;

export interface AgentRunner {
  /** Met un réveil en file ; démarre un épisode si aucun n'est en cours. */
  wake(event: WakeEvent): void;
  /** true pendant un épisode. */
  busy(): boolean;
  /** Interrompt l'épisode en cours, vide la file, refuse les réveils suivants. */
  stop(): void;
  /** Résolue quand la file est vide et qu'aucun épisode n'est en cours (tests, script wake). */
  whenIdle(): Promise<void>;
}
```

Note : `delta` est typé `unknown` (et non `{ type?: string; text?: string }`) parce que le `delta` de l'événement `message_delta` du SDK n'a aucune propriété commune avec cette forme et que TypeScript refuse alors l'assignation (« weak type ») ; le garde `textDelta` de la Task 3 fait la vérification à l'exécution.

- [ ] **Step 2: Écrire `sdkQuery.ts`**

```ts
import { query } from '@anthropic-ai/claude-agent-sdk';
import type { SDKMessage } from '@anthropic-ai/claude-agent-sdk';
import type { AgentMessage, QueryFn } from './types';

/**
 * Réduit un `SDKMessage` aux variantes lues par M6. Les `return m` ne compilent que si
 * chaque type du SDK est bien un sur-type structurel de `AgentMessage` : c'est la vérification
 * des formes utilisées par `streamToDashboard`.
 */
export function toAgentMessage(m: SDKMessage): AgentMessage {
  switch (m.type) {
    case 'assistant':
      return m;
    case 'result':
      return m;
    case 'stream_event':
      return m;
    case 'system':
      return m.subtype === 'init' ? m : { type: 'other' };
    default:
      return { type: 'other' };
  }
}

/** `query()` réel du Claude Agent SDK, sous la forme injectable du runner. */
export const sdkQuery: QueryFn = async function* (prompt, options) {
  for await (const m of query({ prompt, options })) yield toAgentMessage(m);
};
```

- [ ] **Step 3: Vérifier la compilation**

Run: `npm run typecheck -w @tomato/server && npx eslint packages/server`
Expected: exit 0 pour les deux (vérifié sur le SDK 0.3.275 : `SDKAssistantMessage.message.content: BetaContentBlock[]`, `SDKResultSuccess | SDKResultError`, `SDKPartialAssistantMessage.event: BetaRawMessageStreamEvent`, `SDKSystemMessage` avec `mcp_servers: { name; status; source? }[]` et `apiKeySource: ApiKeySource`).

- [ ] **Step 4: Commit**

```bash
git add packages/server/src/agent/types.ts packages/server/src/agent/sdkQuery.ts
git commit -m "feat(agent): types du runner et adaptateur query() vérifié contre le SDK"
```

---

### Task 3: `streamToDashboard` — flux SDK → messages dashboard (pur)

**Files:**
- Create: `packages/server/src/agent/streamToDashboard.ts`, `packages/server/src/agent/streamToDashboard.test.ts`

**Interfaces:**
- Produces: `ROBOT_MCP_NAME = 'robot'`, `ROBOT_TOOL_PREFIX`, `ReportCall`, `StreamResult`, `StreamState`, `StreamStep`, `createStreamState(episodeId: string): StreamState`, `robotToolName(name: string): ToolName | null`, `reduceStreamMessage(state: StreamState, msg: AgentMessage): StreamStep`, `episodeOutcome(state: StreamState, error: string | null): ReportCall`, `episodeEndMessage(state: StreamState, final: ReportCall, measuredDurationMs: number): ServerToDashboard`.
- Consumes: `TOOL_NAMES`, `ToolSchemas`, `ServerToDashboard`, `ToolName` de `@tomato/shared` ; `AgentMessage` (Task 2).

- [ ] **Step 1: Test (échoue)**

`packages/server/src/agent/streamToDashboard.test.ts` :

```ts
import { describe, expect, it } from 'vitest';
import {
  createStreamState,
  episodeEndMessage,
  episodeOutcome,
  reduceStreamMessage,
  robotToolName,
} from './streamToDashboard';
import type { StreamState } from './streamToDashboard';
import type { AgentMessage } from './types';

// Formes vérifiées sur sdk.d.ts (@anthropic-ai/claude-agent-sdk 0.3.275) :
// SDKSystemMessage (init), SDKAssistantMessage.message.content, SDKPartialAssistantMessage.event,
// SDKResultSuccess / SDKResultError.
const init: AgentMessage = {
  type: 'system',
  subtype: 'init',
  session_id: 'sess-1',
  model: 'claude-opus-5',
  mcp_servers: [{ name: 'robot', status: 'connected' }],
  apiKeySource: 'none',
};
const text = (t: string): AgentMessage => ({ type: 'assistant', message: { content: [{ type: 'text', text: t }] } });
const toolUse = (name: string, input: unknown): AgentMessage => ({
  type: 'assistant',
  message: { content: [{ type: 'tool_use', id: 'toolu_1', name, input }] },
});
const delta = (t: string): AgentMessage => ({
  type: 'stream_event',
  event: { type: 'content_block_delta', delta: { type: 'text_delta', text: t } },
});
const result: AgentMessage = {
  type: 'result',
  subtype: 'success',
  is_error: false,
  total_cost_usd: 0.42,
  duration_ms: 12345,
  num_turns: 7,
  session_id: 'sess-1',
};

function run(messages: AgentMessage[]): { state: StreamState; out: unknown[]; deltas: string[] } {
  let state = createStreamState('ep-1');
  const out: unknown[] = [];
  const deltas: string[] = [];
  for (const m of messages) {
    const step = reduceStreamMessage(state, m);
    state = step.state;
    out.push(...step.out);
    if (step.delta !== null) deltas.push(step.delta);
  }
  return { state, out, deltas };
}

describe('robotToolName', () => {
  it('strips the mcp__robot__ prefix and rejects other tools', () => {
    expect(robotToolName('mcp__robot__cut')).toBe('cut');
    expect(robotToolName('mcp__robot__get_views')).toBe('get_views');
    expect(robotToolName('mcp__robot__unknown')).toBeNull();
    expect(robotToolName('mcp__other__cut')).toBeNull();
    expect(robotToolName('Bash')).toBeNull();
  });
});

describe('reduceStreamMessage', () => {
  it('records the session id, model and robot MCP status from the init message', () => {
    const { state } = run([init]);
    expect(state.sessionId).toBe('sess-1');
    expect(state.model).toBe('claude-opus-5');
    expect(state.mcpStatus).toBe('connected');
  });

  it('emits one agent_text per non-empty text block, trimmed', () => {
    const { out } = run([text('  Tomato #3 at X 12.0.  '), text('   '), text('Moving basket.')]);
    expect(out).toEqual([
      { type: 'agent_text', episodeId: 'ep-1', text: 'Tomato #3 at X 12.0.' },
      { type: 'agent_text', episodeId: 'ep-1', text: 'Moving basket.' },
    ]);
  });

  it('forwards text deltas separately and never as dashboard messages', () => {
    const { out, deltas } = run([delta('Tom'), delta('ato'), delta('')]);
    expect(out).toEqual([]);
    expect(deltas).toEqual(['Tom', 'ato']);
  });

  it('counts robot tool calls and ignores foreign tools', () => {
    const { state, out } = run([
      toolUse('mcp__robot__get_views', {}),
      toolUse('mcp__robot__move_basket', { x: 1, y: 2, mode: 'absolute' }),
      toolUse('Read', { file_path: 'x' }),
    ]);
    expect(state.toolCalls).toBe(2);
    expect(out).toEqual([]);
  });

  it('detects a valid report call and keeps outcome and note', () => {
    const { state } = run([toolUse('mcp__robot__report', { outcome: 'harvested', note: 'clean cut' })]);
    expect(state.report).toEqual({ outcome: 'harvested', note: 'clean cut' });
    expect(state.toolCalls).toBe(1);
  });

  it('ignores a report call with invalid arguments', () => {
    const { state } = run([toolUse('mcp__robot__report', { outcome: 'done' })]);
    expect(state.report).toBeNull();
  });

  it('extracts cost, duration, turns and error flag from the result message', () => {
    const { state } = run([init, result]);
    expect(state.result).toEqual({ subtype: 'success', isError: false, costUsd: 0.42, durationMs: 12345, numTurns: 7 });
  });
});

describe('episodeOutcome and episodeEndMessage', () => {
  it('uses the report when present', () => {
    const { state } = run([init, toolUse('mcp__robot__report', { outcome: 'missed', note: 'basket 5 cm off' }), result]);
    expect(episodeOutcome(state, null)).toEqual({ outcome: 'missed', note: 'basket 5 cm off' });
    expect(episodeEndMessage(state, episodeOutcome(state, null), 999)).toEqual({
      type: 'episode_end',
      episodeId: 'ep-1',
      outcome: 'missed',
      note: 'basket 5 cm off',
      toolCalls: 1,
      costUsd: 0.42,
      durationMs: 12345,
    });
  });

  it('is aborted without report, with the SDK error subtype or the thrown error', () => {
    const errored: AgentMessage = { ...result, subtype: 'error_max_turns', is_error: true };
    expect(episodeOutcome(run([errored]).state, null)).toEqual({ outcome: 'aborted', note: 'agent ended with error_max_turns' });
    expect(episodeOutcome(run([]).state, 'ECONNREFUSED')).toEqual({ outcome: 'aborted', note: 'agent error: ECONNREFUSED' });
    expect(episodeOutcome(run([result]).state, null)).toEqual({ outcome: 'aborted', note: 'agent ended without report' });
  });

  it('falls back to the measured duration and zero cost without a result message', () => {
    const state = run([text('hello')]).state;
    const end = episodeEndMessage(state, episodeOutcome(state, null), 4321);
    expect(end).toMatchObject({ type: 'episode_end', costUsd: 0, durationMs: 4321, toolCalls: 0 });
  });
});
```

- [ ] **Step 2: Vérifier l'échec**

Run: `npx vitest run packages/server/src/agent/streamToDashboard.test.ts`
Expected: FAIL, module `./streamToDashboard` introuvable.

- [ ] **Step 3: Écrire `streamToDashboard.ts`**

```ts
import { TOOL_NAMES, ToolSchemas } from '@tomato/shared';
import type { ServerToDashboard, ToolName } from '@tomato/shared';
import type { AgentContentBlock, AgentMessage, EpisodeOutcome } from './types';

export const ROBOT_MCP_NAME = 'robot';
export const ROBOT_TOOL_PREFIX = `mcp__${ROBOT_MCP_NAME}__`;

export interface ReportCall {
  outcome: EpisodeOutcome;
  note: string;
}

export interface StreamResult {
  subtype: string;
  isError: boolean;
  costUsd: number;
  durationMs: number;
  numTurns: number;
}

/** État accumulé au fil d'un épisode ; immuable, chaque réduction renvoie un nouvel objet. */
export interface StreamState {
  episodeId: string;
  sessionId: string | null;
  model: string | null;
  /** Statut du serveur MCP `robot` dans le message `init` (`connected`, `pending`, `failed`…). */
  mcpStatus: string | null;
  toolCalls: number;
  report: ReportCall | null;
  result: StreamResult | null;
}

export interface StreamStep {
  state: StreamState;
  /** Messages à diffuser au dashboard, dans l'ordre. */
  out: ServerToDashboard[];
  /** Fragment de texte en continu (pour la console), null sinon. */
  delta: string | null;
}

export function createStreamState(episodeId: string): StreamState {
  return { episodeId, sessionId: null, model: null, mcpStatus: null, toolCalls: 0, report: null, result: null };
}

/** `mcp__robot__cut` → `cut` ; null pour tout autre nom. */
export function robotToolName(name: string): ToolName | null {
  if (!name.startsWith(ROBOT_TOOL_PREFIX)) return null;
  const short = name.slice(ROBOT_TOOL_PREFIX.length);
  return (TOOL_NAMES as string[]).includes(short) ? (short as ToolName) : null;
}

function parseReport(input: unknown): ReportCall | null {
  const parsed = ToolSchemas.report.safeParse(input);
  return parsed.success ? { outcome: parsed.data.outcome, note: parsed.data.note } : null;
}

/** Texte d'un `content_block_delta` de type `text_delta` (événement brut de l'API Messages), sinon null. */
function textDelta(delta: unknown): string | null {
  if (typeof delta !== 'object' || delta === null) return null;
  const d = delta as { type?: unknown; text?: unknown };
  return d.type === 'text_delta' && typeof d.text === 'string' && d.text !== '' ? d.text : null;
}

function reduceBlocks(state: StreamState, blocks: ReadonlyArray<AgentContentBlock>): StreamStep {
  let next = state;
  const out: ServerToDashboard[] = [];
  for (const block of blocks) {
    if (block.type === 'text' && block.text !== undefined && block.text.trim() !== '') {
      out.push({ type: 'agent_text', episodeId: state.episodeId, text: block.text.trim() });
    } else if (block.type === 'tool_use' && block.name !== undefined) {
      const tool = robotToolName(block.name);
      if (tool === null) continue;
      const report = tool === 'report' ? parseReport(block.input) : null;
      next = { ...next, toolCalls: next.toolCalls + 1, report: report ?? next.report };
    }
  }
  return { state: next, out, delta: null };
}

/** Convertit un message du SDK en messages dashboard et met à jour l'état de l'épisode. */
export function reduceStreamMessage(state: StreamState, msg: AgentMessage): StreamStep {
  switch (msg.type) {
    case 'system': {
      const robot = msg.mcp_servers.find((s) => s.name === ROBOT_MCP_NAME);
      return {
        state: { ...state, sessionId: msg.session_id, model: msg.model, mcpStatus: robot?.status ?? 'absent' },
        out: [],
        delta: null,
      };
    }
    case 'assistant':
      return reduceBlocks(state, msg.message.content);
    case 'stream_event':
      return { state, out: [], delta: msg.event.type === 'content_block_delta' ? textDelta(msg.event.delta) : null };
    case 'result':
      return {
        state: {
          ...state,
          sessionId: msg.session_id,
          result: {
            subtype: msg.subtype,
            isError: msg.is_error,
            costUsd: msg.total_cost_usd,
            durationMs: msg.duration_ms,
            numTurns: msg.num_turns,
          },
        },
        out: [],
        delta: null,
      };
    case 'other':
      return { state, out: [], delta: null };
  }
}

/** Issue et note de l'épisode : celles du `report` de l'agent, sinon `aborted` avec la raison. */
export function episodeOutcome(state: StreamState, error: string | null): ReportCall {
  if (state.report !== null) return state.report;
  if (error !== null) return { outcome: 'aborted', note: `agent error: ${error}` };
  if (state.result?.isError) return { outcome: 'aborted', note: `agent ended with ${state.result.subtype}` };
  return { outcome: 'aborted', note: 'agent ended without report' };
}

/** Message `episode_end` ; coût et durée viennent du `result` du SDK, sinon de la durée mesurée. */
export function episodeEndMessage(
  state: StreamState,
  final: ReportCall,
  measuredDurationMs: number,
): ServerToDashboard {
  return {
    type: 'episode_end',
    episodeId: state.episodeId,
    outcome: final.outcome,
    note: final.note,
    toolCalls: state.toolCalls,
    costUsd: state.result?.costUsd ?? 0,
    durationMs: state.result?.durationMs ?? measuredDurationMs,
  };
}
```

- [ ] **Step 4: Vérifier le succès**

Run: `npx vitest run packages/server/src/agent/streamToDashboard.test.ts`
Expected: PASS, 11 tests.

- [ ] **Step 5: Commit**

```bash
git add packages/server/src/agent/streamToDashboard.ts packages/server/src/agent/streamToDashboard.test.ts
git commit -m "feat(agent): conversion pure du flux SDK en messages dashboard et état d'épisode"
```

---

### Task 4: `wakePrompt` — message de réveil et résumé de l'état

**Files:**
- Create: `packages/server/src/agent/wakePrompt.ts`, `packages/server/src/agent/wakePrompt.test.ts`

**Interfaces:**
- Produces: `summarizeWorld(state: WorldState | null): string`, `buildWakePrompt(event: WakeEvent, statusText: string, opts: { resumed: boolean }): string`.
- Consumes: `MAX_TOOL_CALLS_PER_EPISODE`, `Vec3`, `WorldState` de `@tomato/shared` ; `WakeEvent`.

- [ ] **Step 1: Test (échoue)**

`packages/server/src/agent/wakePrompt.test.ts` :

```ts
import { describe, expect, it } from 'vitest';
import { createDefaultWorld } from '@tomato/shared';
import type { Tomato, WorldState } from '@tomato/shared';
import { buildWakePrompt, summarizeWorld } from './wakePrompt';

const tomato = (id: number, state: Tomato['state']): Tomato => ({
  id,
  state,
  ripeness: state === 'ripe' ? 1 : 0.2,
  positionCm: [10, -5, 40],
  radiusCm: 3,
  stem: { fromCm: [8, -4, 44], toCm: [10, -5, 43] },
  attached: true,
  visibleIn: { top: 1, front: 1, side: 1 },
});

describe('summarizeWorld', () => {
  it('says so when no state has been received', () => {
    expect(summarizeWorld(null)).toMatch(/no simulation state/);
  });

  it('lists sim time, tomatoes with ripe ids, scissors and basket in cm', () => {
    const w: WorldState = { ...createDefaultWorld(1), simTimeS: 12.34, tomatoes: [tomato(1, 'unripe'), tomato(3, 'ripe')] };
    const s = summarizeWorld(w);
    expect(s).toContain('sim time 12.3 s');
    expect(s).toContain('2 tomatoes on the plant (ripe: #3)');
    expect(s).toContain('scissors cut point at X 45.0, Y -35.0, Z 60.0 cm, closed');
    expect(s).toContain('basket centre at X 0.0, Y 0.0 cm');
  });
});

describe('buildWakePrompt', () => {
  const event = { tomatoId: 3, positionCm: [12, -4.25, 38.04] as const, ripeness: 0.973 };

  it('names the target with its position in cm, the status, the limit and the first call', () => {
    const p = buildWakePrompt(event, 'status text', { resumed: false });
    expect(p).toContain('tomato #3 at X 12.0, Y -4.3, Z 38.0 cm, ripeness 0.97');
    expect(p).toContain('Current status: status text');
    expect(p).toContain('at most 40 tool calls');
    expect(p).toContain('report');
    expect(p).toMatch(/Start with get_views\.$/);
    expect(p).not.toContain('New episode');
  });

  it('warns that earlier positions are stale when the session is resumed', () => {
    const p = buildWakePrompt(event, 'status', { resumed: true });
    expect(p.startsWith('New episode.')).toBe(true);
    expect(p).toContain('stale');
  });
});
```

- [ ] **Step 2: Vérifier l'échec**

Run: `npx vitest run packages/server/src/agent/wakePrompt.test.ts`
Expected: FAIL, module `./wakePrompt` introuvable.

- [ ] **Step 3: Écrire `wakePrompt.ts`**

```ts
import { MAX_TOOL_CALLS_PER_EPISODE } from '@tomato/shared';
import type { Vec3, WorldState } from '@tomato/shared';
import type { WakeEvent } from './types';

const fmt = (v: number): string => v.toFixed(1);
const xyz = (p: Vec3): string => `X ${fmt(p[0])}, Y ${fmt(p[1])}, Z ${fmt(p[2])}`;

/** Résumé textuel compact de l'état de la sim (sans image), pour le message de réveil. */
export function summarizeWorld(state: WorldState | null): string {
  if (state === null) return 'no simulation state received yet; call get_status first.';
  const ripe = state.tomatoes.filter((t) => t.state === 'ripe' && t.attached).map((t) => `#${t.id}`);
  const parts = [
    `sim time ${fmt(state.simTimeS)} s`,
    `${state.tomatoes.length} tomatoes on the plant${ripe.length > 0 ? ` (ripe: ${ripe.join(', ')})` : ''}`,
    `scissors cut point at ${xyz(state.scissors.cutPointCm)} cm, ${state.scissors.openingDeg > 0 ? 'open' : 'closed'}`,
    `basket centre at X ${fmt(state.basket.centerCm[0])}, Y ${fmt(state.basket.centerCm[1])} cm`,
  ];
  return parts.join('; ') + '.';
}

/** Message utilisateur envoyé à l'agent à chaque réveil. */
export function buildWakePrompt(event: WakeEvent, statusText: string, opts: { resumed: boolean }): string {
  const lines: string[] = [];
  if (opts.resumed) {
    lines.push(
      'New episode. The previous episode is over and the plant may have changed: every position from before is stale, look again before acting.',
    );
  }
  lines.push(
    `A ripe tomato was detected: tomato #${event.tomatoId} at ${xyz(event.positionCm)} cm, ripeness ${event.ripeness.toFixed(2)}. It is the target of this episode.`,
    `Current status: ${statusText}`,
    'Harvest it: place the basket under the predicted impact point, bring the scissors to the middle of its stem in 5 cm then 1 cm steps, align the blades, open, cut, confirm the landing with get_status, then call report.',
    `You have at most ${MAX_TOOL_CALLS_PER_EPISODE} tool calls in this episode, report included. Start with get_views.`,
  );
  return lines.join('\n');
}
```

- [ ] **Step 4: Vérifier le succès**

Run: `npx vitest run packages/server/src/agent/wakePrompt.test.ts`
Expected: PASS, 4 tests.

- [ ] **Step 5: Commit**

```bash
git add packages/server/src/agent/wakePrompt.ts packages/server/src/agent/wakePrompt.test.ts
git commit -m "feat(agent): message de réveil et résumé de l'état de la sim"
```

---

### Task 5: `queryOptions` — options de `query()` (noms vérifiés)

**Files:**
- Create: `packages/server/src/agent/queryOptions.ts`, `packages/server/src/agent/queryOptions.test.ts`

**Interfaces:**
- Produces: `DEFAULT_MODEL = 'claude-opus-5'`, `AGENT_MAX_TURNS = 50`, `MAX_MCP_OUTPUT_TOKENS = '400000'`, `QueryOptionsInput`, `buildQueryOptions(input: QueryOptionsInput): Options`.
- Consumes: `Options` de `@anthropic-ai/claude-agent-sdk` ; `ROBOT_MCP_NAME` (Task 3).

- [ ] **Step 1: Test (échoue)**

`packages/server/src/agent/queryOptions.test.ts` :

```ts
import { describe, expect, it } from 'vitest';
import { AGENT_MAX_TURNS, MAX_MCP_OUTPUT_TOKENS, buildQueryOptions } from './queryOptions';

describe('buildQueryOptions', () => {
  const abortController = new AbortController();
  const base = { mcpUrl: 'http://localhost:7331/mcp', model: 'claude-opus-5', systemPrompt: 'SYS', abortController };

  it('declares the robot MCP server over HTTP, allows only its tools and disables built-in tools', () => {
    const o = buildQueryOptions({ ...base, sessionId: null });
    expect(o.mcpServers).toEqual({ robot: { type: 'http', url: 'http://localhost:7331/mcp', alwaysLoad: true } });
    expect(o.allowedTools).toEqual(['mcp__robot__*']);
    expect(o.tools).toEqual([]);
    expect(o.permissionMode).toBe('dontAsk');
    expect(o.strictMcpConfig).toBe(true);
    expect(o.settingSources).toEqual([]);
  });

  it('passes the system prompt as a plain string, the model, streaming and the turn limit', () => {
    const o = buildQueryOptions({ ...base, sessionId: null });
    expect(o.systemPrompt).toBe('SYS');
    expect(o.model).toBe('claude-opus-5');
    expect(o.includePartialMessages).toBe(true);
    expect(o.maxTurns).toBe(AGENT_MAX_TURNS);
    expect(o.persistSession).toBe(true);
    expect(o.abortController).toBe(abortController);
  });

  it('raises the MCP output limit in the subprocess environment while inheriting the rest', () => {
    const o = buildQueryOptions({ ...base, sessionId: null });
    expect(o.env?.MAX_MCP_OUTPUT_TOKENS).toBe(MAX_MCP_OUTPUT_TOKENS);
    expect(o.env?.PATH).toBe(process.env.PATH);
  });

  it('adds resume only when a session id is known, and stderr only when given', () => {
    expect('resume' in buildQueryOptions({ ...base, sessionId: null })).toBe(false);
    expect(buildQueryOptions({ ...base, sessionId: 'abc' }).resume).toBe('abc');
    expect('stderr' in buildQueryOptions({ ...base, sessionId: null })).toBe(false);
    const stderr = (): void => undefined;
    expect(buildQueryOptions({ ...base, sessionId: null, stderr }).stderr).toBe(stderr);
  });
});
```

- [ ] **Step 2: Vérifier l'échec**

Run: `npx vitest run packages/server/src/agent/queryOptions.test.ts`
Expected: FAIL, module `./queryOptions` introuvable.

- [ ] **Step 3: Écrire `queryOptions.ts`**

```ts
import type { Options } from '@anthropic-ai/claude-agent-sdk';
import { ROBOT_MCP_NAME } from './streamToDashboard';

/** Modèle par défaut (spec : Opus 5), surchargé par `TOMATO_MODEL`. */
export const DEFAULT_MODEL = 'claude-opus-5';

/**
 * Tours agentiques maximaux par épisode : 40 appels d'outils (limite MCP de M5)
 * plus une marge pour les tours de texte seul et le `report` final.
 */
export const AGENT_MAX_TURNS = 50;

/**
 * Limite de taille des résultats MCP côté Claude Code (défaut 25 000 tokens). Trois PNG 800×800
 * en base64 dépassent ce défaut ; les images restent soumises à cette variable (doc MCP),
 * d'où une valeur haute passée dans l'environnement du processus Claude Code.
 */
export const MAX_MCP_OUTPUT_TOKENS = '400000';

export interface QueryOptionsInput {
  mcpUrl: string;
  model: string;
  systemPrompt: string;
  /** Identifiant de session à reprendre, null pour une nouvelle session. */
  sessionId: string | null;
  abortController: AbortController;
  stderr?: (data: string) => void;
}

/**
 * Options de `query()` pour un épisode. Noms vérifiés sur `Options` de
 * @anthropic-ai/claude-agent-sdk 0.3.275 (sdk.d.ts) et la doc officielle.
 */
export function buildQueryOptions(input: QueryOptionsInput): Options {
  const base: Options = {
    systemPrompt: input.systemPrompt,
    model: input.model,
    mcpServers: { [ROBOT_MCP_NAME]: { type: 'http', url: input.mcpUrl, alwaysLoad: true } },
    tools: [],
    allowedTools: [`mcp__${ROBOT_MCP_NAME}__*`],
    permissionMode: 'dontAsk',
    strictMcpConfig: true,
    settingSources: [],
    persistSession: true,
    includePartialMessages: true,
    maxTurns: AGENT_MAX_TURNS,
    abortController: input.abortController,
    env: { ...process.env, MAX_MCP_OUTPUT_TOKENS },
  };
  const withStderr = input.stderr === undefined ? base : { ...base, stderr: input.stderr };
  return input.sessionId === null ? withStderr : { ...withStderr, resume: input.sessionId };
}
```

- [ ] **Step 4: Vérifier le succès**

Run: `npx vitest run packages/server/src/agent/queryOptions.test.ts && npm run typecheck -w @tomato/server`
Expected: PASS, 4 tests ; `tsc` exit 0 (chaque clé est typée par `Options` du SDK : une faute de nom casse la compilation).

- [ ] **Step 5: Commit**

```bash
git add packages/server/src/agent/queryOptions.ts packages/server/src/agent/queryOptions.test.ts
git commit -m "feat(agent): options de query() — MCP robot en HTTP, outils restreints, dontAsk, streaming, reprise"
```

---

### Task 6: `agentRunner` — file de réveils, un épisode à la fois, reprise, arrêt

**Files:**
- Create: `packages/server/src/agent/agentRunner.ts`, `packages/server/src/agent/agentRunner.test.ts`

**Interfaces:**
- Produces: `AgentRunnerDeps { hub: AgentHub; session: AgentSession; mcpUrl: string; model: string; systemPrompt: string; query?: QueryFn; statusText?: () => string; log?: (line: string) => void; onDelta?: (text: string) => void }`, `createAgentRunner(deps: AgentRunnerDeps): AgentRunner`.
- Consumes: Tasks 2 à 5.

Comportement : `wake` met en file (doublon de `tomatoId` en cours ou en file ignoré) et démarre `drain()` si rien ne tourne ; `drain` enchaîne les épisodes un par un ; `runEpisode` : `startEpisode` si aucun épisode ouvert → `episode_start` → `query()` (reprise si une session est connue) → réduction du flux (`agent_text` diffusés, deltas vers `onDelta`) → mémorisation de `session_id` (oubliée si la reprise a échoué) → `episode_end` diffusé → `endEpisode` si l'épisode est encore ouvert. `stop()` : abort de l'épisode courant, file vidée, réveils suivants refusés.

- [ ] **Step 1: Test (échoue)**

`packages/server/src/agent/agentRunner.test.ts` :

```ts
import { describe, expect, it } from 'vitest';
import type { Phase, ServerToDashboard } from '@tomato/shared';
import { createAgentRunner } from './agentRunner';
import type { AgentMessage, AgentSession, QueryFn, WakeEvent } from './types';

interface Call {
  prompt: string;
  resume: string | undefined;
}

/** Faux `query()` : rejoue un script de messages par appel, ou lève si le script est une erreur. */
function fakeQuery(scripts: Array<AgentMessage[] | Error>, opts: { gate?: () => Promise<void> } = {}) {
  const calls: Call[] = [];
  const query: QueryFn = async function* (prompt, options) {
    calls.push({ prompt, resume: options.resume });
    const script = scripts[calls.length - 1] ?? [];
    if (script instanceof Error) throw script;
    for (const m of script) {
      await opts.gate?.();
      if (options.abortController?.signal.aborted) throw new Error('aborted');
      yield m;
    }
  };
  return { query, calls };
}

function fakeSession() {
  let episodeId: string | null = null;
  let n = 0;
  const ended: Array<{ outcome: string; note: string }> = [];
  const listeners: Array<(p: Phase) => void> = [];
  const session: AgentSession = {
    get: () => ({ phase: episodeId === null ? 'idle' : 'detected', episodeId, targetTomatoId: null }),
    startEpisode: () => {
      episodeId = `ep-${++n}`;
    },
    endEpisode: (outcome, note) => {
      ended.push({ outcome, note });
      episodeId = null;
    },
    onPhase: (fn) => listeners.push(fn),
  };
  return { session, ended, isOpen: () => episodeId !== null };
}

const init = (sessionId: string): AgentMessage => ({
  type: 'system',
  subtype: 'init',
  session_id: sessionId,
  model: 'claude-opus-5',
  mcp_servers: [{ name: 'robot', status: 'connected' }],
  apiKeySource: 'none',
});
const text = (t: string): AgentMessage => ({ type: 'assistant', message: { content: [{ type: 'text', text: t }] } });
const report = (outcome: 'harvested' | 'missed' | 'aborted'): AgentMessage => ({
  type: 'assistant',
  message: { content: [{ type: 'tool_use', id: 't1', name: 'mcp__robot__report', input: { outcome, note: 'ok' } }] },
});
const result = (sessionId: string, isError = false): AgentMessage => ({
  type: 'result',
  subtype: isError ? 'error_during_execution' : 'success',
  is_error: isError,
  total_cost_usd: 0.1,
  duration_ms: 500,
  num_turns: 3,
  session_id: sessionId,
});
const wake = (tomatoId: number): WakeEvent => ({ tomatoId, positionCm: [1, 2, 3], ripeness: 1 });

function setup(scripts: Array<AgentMessage[] | Error>, gate?: () => Promise<void>) {
  const out: ServerToDashboard[] = [];
  const { query, calls } = fakeQuery(scripts, gate === undefined ? {} : { gate });
  const s = fakeSession();
  const runner = createAgentRunner({
    hub: { broadcast: (m) => out.push(m) },
    session: s.session,
    mcpUrl: 'http://localhost:7331/mcp',
    model: 'claude-opus-5',
    systemPrompt: 'SYS',
    query,
    statusText: () => 'status',
  });
  return { runner, out, calls, ...s };
}

describe('createAgentRunner', () => {
  it('runs an episode: starts it, streams text, and ends with the reported outcome', async () => {
    const t = setup([[init('s1'), text('Looking.'), report('harvested'), result('s1')]]);
    t.runner.wake(wake(3));
    expect(t.runner.busy()).toBe(true);
    await t.runner.whenIdle();
    expect(t.runner.busy()).toBe(false);
    expect(t.out.map((m) => m.type)).toEqual(['episode_start', 'agent_text', 'episode_end']);
    expect(t.out[0]).toEqual({ type: 'episode_start', episodeId: 'ep-1', tomatoId: 3, sessionResumed: false });
    expect(t.out[2]).toMatchObject({ type: 'episode_end', episodeId: 'ep-1', outcome: 'harvested', toolCalls: 1, costUsd: 0.1, durationMs: 500 });
    expect(t.calls[0]?.prompt).toContain('tomato #3');
    expect(t.calls[0]?.resume).toBeUndefined();
    expect(t.ended).toEqual([{ outcome: 'harvested', note: 'ok' }]);
  });

  it('resumes the session on the next episode and says so in the prompt', async () => {
    const t = setup([
      [init('s1'), report('missed'), result('s1')],
      [init('s1'), report('harvested'), result('s1')],
    ]);
    t.runner.wake(wake(1));
    await t.runner.whenIdle();
    t.runner.wake(wake(2));
    await t.runner.whenIdle();
    expect(t.calls[1]?.resume).toBe('s1');
    expect(t.calls[1]?.prompt.startsWith('New episode.')).toBe(true);
    expect(t.out.filter((m) => m.type === 'episode_start')[1]).toMatchObject({ sessionResumed: true });
  });

  it('queues a wake received during an episode and ignores duplicates', async () => {
    let release: () => void = () => undefined;
    const gate = new Promise<void>((r) => (release = r));
    const t = setup([[init('s1'), report('harvested'), result('s1')], [init('s1'), report('harvested'), result('s1')]], () => gate);
    t.runner.wake(wake(1));
    t.runner.wake(wake(2));
    t.runner.wake(wake(2));
    t.runner.wake(wake(1));
    release();
    await t.runner.whenIdle();
    expect(t.calls.length).toBe(2);
    expect(t.out.filter((m) => m.type === 'episode_start').map((m) => (m.type === 'episode_start' ? m.tomatoId : -1))).toEqual([1, 2]);
  });

  it('ends the episode as aborted when the agent stops without report', async () => {
    const t = setup([[init('s1'), text('Giving up.'), result('s1')]]);
    t.runner.wake(wake(5));
    await t.runner.whenIdle();
    expect(t.ended).toEqual([{ outcome: 'aborted', note: 'agent ended without report' }]);
    expect(t.out.at(-1)).toMatchObject({ type: 'episode_end', outcome: 'aborted' });
  });

  it('survives a thrown query, reports aborted and drops a failed resume', async () => {
    const t = setup([[init('s1'), report('harvested'), result('s1')], new Error('resume failed'), [init('s2'), report('harvested'), result('s2')]]);
    t.runner.wake(wake(1));
    await t.runner.whenIdle();
    t.runner.wake(wake(2));
    await t.runner.whenIdle();
    expect(t.out.at(-1)).toMatchObject({ type: 'episode_end', outcome: 'aborted', note: 'agent error: resume failed' });
    expect(t.isOpen()).toBe(false);
    t.runner.wake(wake(3));
    await t.runner.whenIdle();
    expect(t.calls[2]?.resume).toBeUndefined();
  });

  it('stop() aborts the current episode, clears the queue and refuses new wakes', async () => {
    let release: () => void = () => undefined;
    const gate = new Promise<void>((r) => (release = r));
    const t = setup([[init('s1'), text('a'), text('b'), report('harvested'), result('s1')]], () => gate);
    t.runner.wake(wake(1));
    t.runner.wake(wake(2));
    t.runner.stop();
    release();
    await t.runner.whenIdle();
    expect(t.calls.length).toBe(1);
    expect(t.out.at(-1)).toMatchObject({ type: 'episode_end', outcome: 'aborted' });
    t.runner.wake(wake(3));
    expect(t.runner.busy()).toBe(false);
  });
});
```

- [ ] **Step 2: Vérifier l'échec**

Run: `npx vitest run packages/server/src/agent/agentRunner.test.ts`
Expected: FAIL, module `./agentRunner` introuvable.

- [ ] **Step 3: Écrire `agentRunner.ts`**

```ts
import { buildQueryOptions } from './queryOptions';
import { sdkQuery } from './sdkQuery';
import {
  createStreamState,
  episodeEndMessage,
  episodeOutcome,
  reduceStreamMessage,
} from './streamToDashboard';
import type { StreamState } from './streamToDashboard';
import type { AgentHub, AgentRunner, AgentSession, QueryFn, WakeEvent } from './types';
import { buildWakePrompt } from './wakePrompt';

export interface AgentRunnerDeps {
  hub: AgentHub;
  session: AgentSession;
  mcpUrl: string;
  model: string;
  systemPrompt: string;
  /** `query()` du SDK par défaut ; les tests injectent un générateur factice. */
  query?: QueryFn;
  /** Texte d'état joint au message de réveil (résumé de la sim). */
  statusText?: () => string;
  /** Journal console (texte en continu de l'agent, événements du runner). */
  log?: (line: string) => void;
  /** Fragments de texte en continu (console). */
  onDelta?: (text: string) => void;
}

/**
 * Runner d'agent : file de réveils, un épisode à la fois, reprise de session entre épisodes,
 * conversion du flux SDK en messages dashboard. Les `tool_call_*` viennent du MCP (M5), pas d'ici.
 */
export function createAgentRunner(deps: AgentRunnerDeps): AgentRunner {
  const queryFn = deps.query ?? sdkQuery;
  const log = deps.log ?? ((): void => undefined);
  const queue: WakeEvent[] = [];
  let running = false;
  let stopped = false;
  let currentTomato: number | null = null;
  let abort: AbortController | null = null;
  let sessionId: string | null = null;
  let idle: Promise<void> = Promise.resolve();

  async function consumeStream(prompt: string, state: StreamState): Promise<{ state: StreamState; error: string | null }> {
    abort = new AbortController();
    const options = buildQueryOptions({
      mcpUrl: deps.mcpUrl,
      model: deps.model,
      systemPrompt: deps.systemPrompt,
      sessionId,
      abortController: abort,
      stderr: (data) => log(`[claude stderr] ${data.trimEnd()}`),
    });
    try {
      for await (const msg of queryFn(prompt, options)) {
        const step = reduceStreamMessage(state, msg);
        state = step.state;
        for (const out of step.out) deps.hub.broadcast(out);
        if (step.delta !== null) deps.onDelta?.(step.delta);
        if (msg.type === 'system') log(`session ${msg.session_id} model ${msg.model} robot MCP ${state.mcpStatus ?? '?'} auth ${msg.apiKeySource}`);
      }
      return { state, error: null };
    } catch (err) {
      return { state, error: err instanceof Error ? err.message : String(err) };
    } finally {
      abort = null;
    }
  }

  async function runEpisode(event: WakeEvent): Promise<void> {
    if (deps.session.get().episodeId === null) deps.session.startEpisode(event.tomatoId);
    const episodeId = deps.session.get().episodeId ?? 'manual';
    const resumed = sessionId !== null;
    currentTomato = event.tomatoId;
    deps.hub.broadcast({ type: 'episode_start', episodeId, tomatoId: event.tomatoId, sessionResumed: resumed });
    log(`episode ${episodeId} for tomato #${event.tomatoId} (${resumed ? 'resumed session' : 'new session'})`);

    const startedAt = Date.now();
    const prompt = buildWakePrompt(event, deps.statusText?.() ?? 'unknown', { resumed });
    const { state, error } = await consumeStream(prompt, createStreamState(episodeId));

    if (state.sessionId !== null && error === null && !state.result?.isError) {
      sessionId = state.sessionId;
    } else if (resumed) {
      sessionId = null;
      log('session could not be resumed cleanly; the next episode starts a fresh session');
    }
    const final = episodeOutcome(state, error);
    deps.hub.broadcast(episodeEndMessage(state, final, Date.now() - startedAt));
    if (deps.session.get().episodeId !== null) deps.session.endEpisode(final.outcome, final.note);
    log(`episode ${episodeId} ended: ${final.outcome} (${state.toolCalls} tool calls, $${(state.result?.costUsd ?? 0).toFixed(3)})`);
    currentTomato = null;
  }

  async function drain(): Promise<void> {
    running = true;
    try {
      for (let next = queue.shift(); next !== undefined && !stopped; next = queue.shift()) {
        await runEpisode(next);
      }
    } finally {
      running = false;
    }
  }

  return {
    wake(event) {
      if (stopped) return;
      if (currentTomato === event.tomatoId || queue.some((q) => q.tomatoId === event.tomatoId)) {
        log(`wake for tomato #${event.tomatoId} ignored: already in progress or queued`);
        return;
      }
      queue.push(event);
      if (!running) idle = drain();
    },
    busy: () => running,
    stop() {
      stopped = true;
      queue.length = 0;
      abort?.abort();
    },
    whenIdle: () => idle,
  };
}
```

- [ ] **Step 4: Vérifier le succès**

Run: `npx vitest run packages/server/src/agent/agentRunner.test.ts`
Expected: PASS, 6 tests.

- [ ] **Step 5: Commit**

```bash
git add packages/server/src/agent/agentRunner.ts packages/server/src/agent/agentRunner.test.ts
git commit -m "feat(agent): runner — file de réveils, un épisode à la fois, reprise de session, abort et stop"
```

---

### Task 7: `wakeServer` — réveil manuel en HTTP

**Files:**
- Create: `packages/server/src/agent/wakeServer.ts`, `packages/server/src/agent/wakeServer.test.ts`

**Interfaces:**
- Produces: `DEFAULT_WAKE_PORT = 7333`, `WakeServerOptions { port: number; runner: AgentRunner; resolve: (tomatoId: number) => WakeEvent | null; knownIds: () => number[] }`, `WakeServer { port: number; close(): Promise<void> }`, `handleWakeRequest(opts, req, res): void`, `createWakeServer(opts: WakeServerOptions): Promise<WakeServer>`.

- [ ] **Step 1: Test (échoue)**

`packages/server/src/agent/wakeServer.test.ts` :

```ts
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { AgentRunner, WakeEvent } from './types';
import { createWakeServer } from './wakeServer';
import type { WakeServer } from './wakeServer';

describe('wake server', () => {
  const woken: WakeEvent[] = [];
  let busy = false;
  const runner: AgentRunner = {
    wake: (e) => woken.push(e),
    busy: () => busy,
    stop: () => undefined,
    whenIdle: () => Promise.resolve(),
  };
  let server: WakeServer;

  beforeAll(async () => {
    server = await createWakeServer({
      port: 0,
      runner,
      resolve: (id) => (id === 3 ? { tomatoId: 3, positionCm: [1, 2, 3], ripeness: 1 } : null),
      knownIds: () => [3],
    });
  });
  afterAll(() => server.close());

  const url = (path: string): string => `http://127.0.0.1:${server.port}${path}`;

  it('queues a wake for a known tomato and reports whether an episode is running', async () => {
    const r = await fetch(url('/wake/3'), { method: 'POST' });
    expect(r.status).toBe(202);
    expect(await r.json()).toEqual({ queued: true, tomatoId: 3, behindRunningEpisode: false });
    expect(woken).toEqual([{ tomatoId: 3, positionCm: [1, 2, 3], ripeness: 1 }]);
    busy = true;
    const r2 = await fetch(url('/wake/3'), { method: 'POST' });
    expect(await r2.json()).toMatchObject({ behindRunningEpisode: true });
  });

  it('rejects an unknown tomato with the known ids', async () => {
    const r = await fetch(url('/wake/9'), { method: 'POST' });
    expect(r.status).toBe(404);
    expect(await r.json()).toEqual({ error: 'unknown_tomato', tomatoId: 9, known: [3] });
  });

  it('answers GET /wake with the runner state and 404 elsewhere', async () => {
    expect(await (await fetch(url('/wake'))).json()).toEqual({ busy: true, tomatoes: [3] });
    expect((await fetch(url('/other'))).status).toBe(404);
    expect((await fetch(url('/wake/3'))).status).toBe(404);
  });
});
```

- [ ] **Step 2: Vérifier l'échec**

Run: `npx vitest run packages/server/src/agent/wakeServer.test.ts`
Expected: FAIL, module `./wakeServer` introuvable.

- [ ] **Step 3: Écrire `wakeServer.ts`**

```ts
import { createServer } from 'node:http';
import type { IncomingMessage, Server, ServerResponse } from 'node:http';
import type { AgentRunner, WakeEvent } from './types';

export const DEFAULT_WAKE_PORT = 7333;

export interface WakeServerOptions {
  /** 0 = port libre (tests). */
  port: number;
  runner: AgentRunner;
  /** Résout la tomate demandée depuis l'état de la sim ; null si inconnue. */
  resolve: (tomatoId: number) => WakeEvent | null;
  /** Identifiants connus, renvoyés dans l'erreur 404. */
  knownIds: () => number[];
}

export interface WakeServer {
  port: number;
  close(): Promise<void>;
}

function send(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { 'content-type': 'application/json' });
  res.end(JSON.stringify(body));
}

/** Route `POST /wake/<tomatoId>` et `GET /wake` (état). */
export function handleWakeRequest(opts: WakeServerOptions, req: IncomingMessage, res: ServerResponse): void {
  const url = req.url ?? '/';
  if (req.method === 'GET' && url === '/wake') {
    send(res, 200, { busy: opts.runner.busy(), tomatoes: opts.knownIds() });
    return;
  }
  const match = /^\/wake\/(\d+)$/.exec(url);
  if (req.method !== 'POST' || match === null) {
    send(res, 404, { error: 'not_found', usage: 'POST /wake/<tomatoId> or GET /wake' });
    return;
  }
  const tomatoId = Number(match[1]);
  const event = opts.resolve(tomatoId);
  if (event === null) {
    send(res, 404, { error: 'unknown_tomato', tomatoId, known: opts.knownIds() });
    return;
  }
  const wasBusy = opts.runner.busy();
  opts.runner.wake(event);
  send(res, 202, { queued: true, tomatoId, behindRunningEpisode: wasBusy });
}

/** Petit serveur HTTP de réveil manuel (`npm run wake -- <tomatoId>`), indépendant d'Express (M5). */
export function createWakeServer(opts: WakeServerOptions): Promise<WakeServer> {
  const server: Server = createServer((req, res) => handleWakeRequest(opts, req, res));
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(opts.port, '127.0.0.1', () => {
      const address = server.address();
      const port = typeof address === 'object' && address !== null ? address.port : opts.port;
      resolve({
        port,
        close: () => new Promise<void>((done) => server.close(() => done())),
      });
    });
  });
}
```

- [ ] **Step 4: Vérifier le succès**

Run: `npx vitest run packages/server/src/agent/wakeServer.test.ts`
Expected: PASS, 3 tests.

- [ ] **Step 5: Commit**

```bash
git add packages/server/src/agent/wakeServer.ts packages/server/src/agent/wakeServer.test.ts
git commit -m "feat(agent): serveur HTTP de réveil manuel POST /wake/<tomatoId>"
```

---

### Task 8: `startAgent` et branchement dans `index.ts`

**Files:**
- Create: `packages/server/src/agent/startAgent.ts`, `packages/server/src/agent/startAgent.test.ts`
- Modify: `packages/server/src/index.ts`

**Interfaces:**
- Produces: `StartAgentDeps { hub: AgentHub; session: AgentSession; sim: AgentSim; mcpUrl: string; model?: string; wakePort?: number; query?: QueryFn; log?: (line: string) => void; onDelta?: (text: string) => void }`, `AgentHandle { runner: AgentRunner; wakePort: number; close(): Promise<void> }`, `resolveWakeEvent(sim: AgentSim, tomatoId: number): WakeEvent | null`, `agentEnv(env?: NodeJS.ProcessEnv): { model: string; wakePort: number; enabled: boolean }`, `startAgent(deps: StartAgentDeps): Promise<AgentHandle>`.
- Consumes: `Hub`, `Session`, `SimBridge` réels de M5 (structurellement compatibles) dans `index.ts`.

- [ ] **Step 1: Test (échoue)**

`packages/server/src/agent/startAgent.test.ts` :

```ts
import { describe, expect, it } from 'vitest';
import { createDefaultWorld } from '@tomato/shared';
import type { Phase, ServerToDashboard, Tomato, WorldState } from '@tomato/shared';
import { agentEnv, resolveWakeEvent, startAgent } from './startAgent';
import type { AgentMessage, AgentSession, QueryFn } from './types';

const tomato: Tomato = {
  id: 4,
  state: 'ripe',
  ripeness: 0.95,
  positionCm: [11, -3, 39],
  radiusCm: 3,
  stem: { fromCm: [9, -2, 43], toCm: [11, -3, 42] },
  attached: true,
  visibleIn: { top: 1, front: 1, side: 1 },
};
const world: WorldState = { ...createDefaultWorld(1), tomatoes: [tomato] };

describe('resolveWakeEvent / agentEnv', () => {
  it('builds the wake event from the latest sim state', () => {
    expect(resolveWakeEvent({ latestState: () => world }, 4)).toEqual({ tomatoId: 4, positionCm: [11, -3, 39], ripeness: 0.95 });
    expect(resolveWakeEvent({ latestState: () => world }, 5)).toBeNull();
    expect(resolveWakeEvent({ latestState: () => null }, 4)).toBeNull();
  });

  it('reads TOMATO_MODEL, TOMATO_WAKE_PORT and TOMATO_AGENT with their defaults', () => {
    expect(agentEnv({})).toEqual({ model: 'claude-opus-5', wakePort: 7333, enabled: true });
    expect(agentEnv({ TOMATO_MODEL: 'claude-sonnet-5', TOMATO_WAKE_PORT: '7444', TOMATO_AGENT: 'off' })).toEqual({
      model: 'claude-sonnet-5',
      wakePort: 7444,
      enabled: false,
    });
  });
});

describe('startAgent', () => {
  it('wakes the runner on phase detected and serves the manual wake endpoint', async () => {
    const out: ServerToDashboard[] = [];
    const listeners: Array<(p: Phase) => void> = [];
    let episodeId: string | null = null;
    let target: number | null = null;
    const session: AgentSession = {
      get: () => ({ phase: 'idle', episodeId, targetTomatoId: target }),
      startEpisode: () => {
        episodeId = 'ep-x';
      },
      endEpisode: () => {
        episodeId = null;
      },
      onPhase: (fn) => listeners.push(fn),
    };
    const prompts: string[] = [];
    const query: QueryFn = async function* (prompt) {
      prompts.push(prompt);
      const messages: AgentMessage[] = [
        { type: 'assistant', message: { content: [{ type: 'tool_use', id: 't', name: 'mcp__robot__report', input: { outcome: 'harvested', note: 'n' } }] } },
      ];
      yield* messages;
    };
    const handle = await startAgent({
      hub: { broadcast: (m) => out.push(m) },
      session,
      sim: { latestState: () => world },
      mcpUrl: 'http://localhost:7331/mcp',
      wakePort: 0,
      query,
      log: () => undefined,
    });
    try {
      target = 4;
      for (const fn of listeners) fn('detected');
      await handle.runner.whenIdle();
      expect(prompts[0]).toContain('tomato #4 at X 11.0, Y -3.0, Z 39.0 cm');
      expect(prompts[0]).toContain('1 tomatoes on the plant (ripe: #4)');
      expect(out.map((m) => m.type)).toEqual(['episode_start', 'episode_end']);

      const r = await fetch(`http://127.0.0.1:${handle.wakePort}/wake/4`, { method: 'POST' });
      expect(r.status).toBe(202);
      await handle.runner.whenIdle();
      expect(prompts.length).toBe(2);
    } finally {
      await handle.close();
    }
  });
});
```

- [ ] **Step 2: Vérifier l'échec**

Run: `npx vitest run packages/server/src/agent/startAgent.test.ts`
Expected: FAIL, module `./startAgent` introuvable.

- [ ] **Step 3: Écrire `startAgent.ts`**

```ts
import { createAgentRunner } from './agentRunner';
import { DEFAULT_MODEL } from './queryOptions';
import { loadSystemPrompt } from './systemPrompt';
import type { AgentHub, AgentRunner, AgentSession, AgentSim, QueryFn, WakeEvent } from './types';
import { summarizeWorld } from './wakePrompt';
import { DEFAULT_WAKE_PORT, createWakeServer } from './wakeServer';

export interface StartAgentDeps {
  hub: AgentHub;
  session: AgentSession;
  sim: AgentSim;
  mcpUrl: string;
  /** Défaut : `TOMATO_MODEL` ou `claude-opus-5`. */
  model?: string;
  /** Défaut : `TOMATO_WAKE_PORT` ou 7333 ; 0 = port libre. */
  wakePort?: number;
  query?: QueryFn;
  log?: (line: string) => void;
  onDelta?: (text: string) => void;
}

export interface AgentHandle {
  runner: AgentRunner;
  wakePort: number;
  close(): Promise<void>;
}

/** Événement de réveil pour une tomate connue de la sim, null sinon. */
export function resolveWakeEvent(sim: AgentSim, tomatoId: number): WakeEvent | null {
  const tomato = sim.latestState()?.tomatoes.find((t) => t.id === tomatoId);
  return tomato === undefined ? null : { tomatoId, positionCm: tomato.positionCm, ripeness: tomato.ripeness };
}

export function agentEnv(env: NodeJS.ProcessEnv = process.env): { model: string; wakePort: number; enabled: boolean } {
  const port = Number(env.TOMATO_WAKE_PORT ?? DEFAULT_WAKE_PORT);
  return {
    model: env.TOMATO_MODEL ?? DEFAULT_MODEL,
    wakePort: Number.isInteger(port) ? port : DEFAULT_WAKE_PORT,
    enabled: env.TOMATO_AGENT !== 'off',
  };
}

/**
 * Branche le runner : réveil sur la phase `detected` de la session (cible = `targetTomatoId`),
 * serveur HTTP de réveil manuel, prompt système chargé une fois.
 */
export async function startAgent(deps: StartAgentDeps): Promise<AgentHandle> {
  const env = agentEnv();
  const log = deps.log ?? ((line: string): void => console.log(`[agent] ${line}`));
  const model = deps.model ?? env.model;
  const runner = createAgentRunner({
    hub: deps.hub,
    session: deps.session,
    mcpUrl: deps.mcpUrl,
    model,
    systemPrompt: loadSystemPrompt(),
    statusText: () => summarizeWorld(deps.sim.latestState()),
    log,
    ...(deps.query === undefined ? {} : { query: deps.query }),
    ...(deps.onDelta === undefined ? {} : { onDelta: deps.onDelta }),
  });
  deps.session.onPhase((phase) => {
    if (phase !== 'detected') return;
    const id = deps.session.get().targetTomatoId;
    const event = id === null ? null : resolveWakeEvent(deps.sim, id);
    if (event === null) log(`phase detected without a known target tomato (${String(id)}); no wake`);
    else runner.wake(event);
  });
  const wake = await createWakeServer({
    port: deps.wakePort ?? env.wakePort,
    runner,
    resolve: (id) => resolveWakeEvent(deps.sim, id),
    knownIds: () => (deps.sim.latestState()?.tomatoes ?? []).map((t) => t.id),
  });
  log(`model ${model}, MCP ${deps.mcpUrl}, manual wake on http://127.0.0.1:${wake.port}/wake/<tomatoId>`);
  return {
    runner,
    wakePort: wake.port,
    close: async () => {
      runner.stop();
      await wake.close();
    },
  };
}
```

- [ ] **Step 4: Vérifier le succès**

Run: `npx vitest run packages/server/src/agent/startAgent.test.ts`
Expected: PASS, 3 tests.

- [ ] **Step 5: Brancher dans `index.ts`**

Faire d'abord `git fetch origin && git rebase origin/main`. Deux cas :

**(a) M5 est mergé** (`src/index.ts` crée `hub`, `sim` (bridge), `session`, le MCP et Express, et contient le runner no-op de M5). Remplacer le runner no-op par :

```ts
import { agentEnv, startAgent } from './agent/startAgent';
// … après la création de hub, sim, session et le démarrage du MCP/Express :
const agent = agentEnv().enabled
  ? await startAgent({ hub, session, sim, mcpUrl: `http://localhost:${mcpPort}/mcp` })
  : null;
if (agent === null) console.log('[agent] disabled (TOMATO_AGENT=off)');
// … dans le gestionnaire d'arrêt (SIGINT/SIGTERM) de M5, avant hub.close() :
await agent?.close();
```

Adapter les noms de variables (`hub`, `sim`, `session`, `mcpPort`) à ceux d'`index.ts` de M5 ; ne rien changer d'autre. Si `index.ts` n'est pas un module `async` de premier niveau, envelopper dans la fonction `main()` existante. Vérifier aussi les hypothèses 1, 2 et 5 (section « Hypothèses sur M5 ») en lisant `src/state/` et `src/mcp/` ; noter tout écart dans `plan_deviations` du verdict.

**(b) M5 n'est pas encore mergé** (`src/index.ts` ne contient que `VERSION`) : ne pas toucher `index.ts`, mettre `status: "pr_created"` avec `plan_deviations: ["branchement index.ts reporté au merge de M5"]`, et ouvrir l'issue `ad-hoc` « M6 : brancher startAgent dans index.ts après M5 » avec le bloc de code ci-dessus. L'intégration de fin d'étape (spec section 9) ne dépend pas de l'agent réel.

Run: `npm run typecheck -w @tomato/server && npx eslint packages/server`
Expected: exit 0.

- [ ] **Step 6: Commit**

```bash
git add packages/server/src/agent/startAgent.ts packages/server/src/agent/startAgent.test.ts packages/server/src/index.ts
git commit -m "feat(agent): branchement — réveil sur phase detected, serveur de réveil, variables TOMATO_*"
```

---

### Task 9: Script `npm run wake -- <tomatoId>` avec transcript

**Files:**
- Create: `packages/server/src/agent/wakeCli.ts`, `packages/server/src/agent/wakeCli.test.ts`, `packages/server/scripts/wake.ts`

**Interfaces:**
- Produces: `EPISODES_DIR: string` (`<racine>/data/episodes/`), `formatTraceLine(m: ServerToDashboard): string | null`, `transcriptPath(tomatoId: number, now?: Date): string`, `runWakeCli(argv: string[], env?: NodeJS.ProcessEnv): Promise<number>`.
- Consumes: `parseMessage`, `ServerToDashboard` de `@tomato/shared` ; `ws` ; le hub WebSocket de M5 (hello `{ role: 'dashboard' }`, diffusion de `ServerToDashboard`) ; le serveur de réveil (Task 7).

Le script se connecte au hub comme un dashboard, déclenche `POST /wake/<id>`, imprime chaque message utile (`episode_start`, `agent_text`, `tool_call_start`, `tool_call_result`, `phase`, `sim_event`, `episode_end`) et l'ajoute horodaté à `data/episodes/wake-<id>-<horodatage>.log`. Code de sortie 0 si `harvested`, 1 sinon, 2 si l'argument manque. Délai maximal 20 minutes.

- [ ] **Step 1: Test (échoue)**

`packages/server/src/agent/wakeCli.test.ts` :

```ts
import { describe, expect, it } from 'vitest';
import { EPISODES_DIR, formatTraceLine, transcriptPath } from './wakeCli';

describe('wake CLI formatting', () => {
  it('formats the messages that matter for a console transcript', () => {
    expect(formatTraceLine({ type: 'episode_start', episodeId: 'e1', tomatoId: 3, sessionResumed: true })).toBe(
      '== episode e1 tomato #3 (resumed session)',
    );
    expect(formatTraceLine({ type: 'agent_text', episodeId: 'e1', text: 'Looking.' })).toBe('[agent] Looking.');
    expect(formatTraceLine({ type: 'tool_call_start', episodeId: 'e1', callId: 'c', tool: 'cut', args: {} })).toBe('[tool ] cut {}');
    expect(formatTraceLine({ type: 'tool_call_result', episodeId: 'e1', callId: 'c', ok: false, summary: 'misaligned', durationMs: 12 })).toBe(
      '[ERROR] misaligned (12 ms)',
    );
    expect(formatTraceLine({ type: 'phase', phase: 'falling', reason: 'cut' })).toBe('[phase] falling (cut)');
    expect(
      formatTraceLine({ type: 'episode_end', episodeId: 'e1', outcome: 'harvested', note: 'n', toolCalls: 9, costUsd: 0.5, durationMs: 61000 }),
    ).toBe('== end harvested: n (9 tool calls, $0.500, 61 s)');
  });

  it('ignores snapshots, views and block activity', () => {
    expect(formatTraceLine({ type: 'block_activity', from: 'server', to: 'agent', label: 'x' })).toBeNull();
  });

  it('writes transcripts under data/episodes at the repository root', () => {
    expect(EPISODES_DIR.replace(/\\/g, '/')).toMatch(/\/data\/episodes\/$/);
    expect(transcriptPath(3, new Date('2026-09-17T10:20:30.000Z')).replace(/\\/g, '/')).toMatch(/data\/episodes\/wake-3-2026-09-17T10-20-30-000Z\.log$/);
  });
});
```

- [ ] **Step 2: Vérifier l'échec**

Run: `npx vitest run packages/server/src/agent/wakeCli.test.ts`
Expected: FAIL, module `./wakeCli` introuvable.

- [ ] **Step 3: Écrire `wakeCli.ts` et `scripts/wake.ts`**

`packages/server/src/agent/wakeCli.ts` :

```ts
import { appendFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import WebSocket from 'ws';
import { parseMessage } from '@tomato/shared';
import type { ServerToDashboard } from '@tomato/shared';
import { DEFAULT_WAKE_PORT } from './wakeServer';

/** `data/episodes/` à la racine du dépôt (ce fichier est dans packages/server/src/agent). */
export const EPISODES_DIR = fileURLToPath(new URL('../../../../data/episodes/', import.meta.url));
const EPISODE_TIMEOUT_MS = 20 * 60 * 1000;

/** Une ligne de transcript par message dashboard ; null pour les messages sans intérêt en console. */
export function formatTraceLine(m: ServerToDashboard): string | null {
  switch (m.type) {
    case 'episode_start':
      return `== episode ${m.episodeId} tomato #${m.tomatoId} (${m.sessionResumed ? 'resumed' : 'new'} session)`;
    case 'agent_text':
      return `[agent] ${m.text}`;
    case 'tool_call_start':
      return `[tool ] ${m.tool} ${JSON.stringify(m.args)}`;
    case 'tool_call_result':
      return `[${m.ok ? ' ok  ' : 'ERROR'}] ${m.summary} (${m.durationMs} ms)`;
    case 'phase':
      return `[phase] ${m.phase} (${m.reason})`;
    case 'sim_event':
      return `[sim  ] ${JSON.stringify(m.event)}`;
    case 'episode_end':
      return `== end ${m.outcome}: ${m.note} (${m.toolCalls} tool calls, $${m.costUsd.toFixed(3)}, ${(m.durationMs / 1000).toFixed(0)} s)`;
    default:
      return null;
  }
}

export function transcriptPath(tomatoId: number, now: Date = new Date()): string {
  return `${EPISODES_DIR}wake-${tomatoId}-${now.toISOString().replace(/[:.]/g, '-')}.log`;
}

/** `npm run wake -w @tomato/server -- <tomatoId>` : déclenche un réveil et suit l'épisode en console. */
export async function runWakeCli(argv: string[], env: NodeJS.ProcessEnv = process.env): Promise<number> {
  const tomatoId = Number(argv[0]);
  if (!Number.isInteger(tomatoId)) {
    console.error('usage: npm run wake -w @tomato/server -- <tomatoId>');
    return 2;
  }
  const wsUrl = `ws://localhost:${env.TOMATO_WS_PORT ?? '7332'}`;
  const wakeUrl = `http://127.0.0.1:${env.TOMATO_WAKE_PORT ?? String(DEFAULT_WAKE_PORT)}/wake/${tomatoId}`;
  mkdirSync(EPISODES_DIR, { recursive: true });
  const file = transcriptPath(tomatoId);
  const write = (line: string): void => {
    console.log(line);
    appendFileSync(file, `${new Date().toISOString()} ${line}\n`);
  };

  const ws = new WebSocket(wsUrl);
  await new Promise<void>((resolve, reject) => {
    ws.once('open', resolve);
    ws.once('error', reject);
  });
  ws.send(JSON.stringify({ type: 'hello', role: 'dashboard' }));
  const finished = new Promise<number>((resolve) => {
    const timer = setTimeout(() => {
      write('== timeout waiting for episode_end');
      resolve(1);
    }, EPISODE_TIMEOUT_MS);
    ws.on('message', (raw) => {
      const m = parseMessage(String(raw));
      if (m === null) return;
      const line = formatTraceLine(m as ServerToDashboard);
      if (line !== null) write(line);
      if (m.type === 'episode_end') {
        clearTimeout(timer);
        resolve(m.outcome === 'harvested' ? 0 : 1);
      }
    });
  });

  const r = await fetch(wakeUrl, { method: 'POST' });
  write(`POST ${wakeUrl} -> ${r.status} ${await r.text()}`);
  if (r.status !== 202) {
    ws.close();
    return 1;
  }
  write(`transcript: ${file}`);
  const code = await finished;
  ws.close();
  return code;
}
```

`packages/server/scripts/wake.ts` :

```ts
import { runWakeCli } from '../src/agent/wakeCli';

runWakeCli(process.argv.slice(2)).then(
  (code) => process.exit(code),
  (err: unknown) => {
    console.error(err instanceof Error ? err.message : String(err));
    process.exit(1);
  },
);
```

- [ ] **Step 4: Vérifier le succès**

Run: `npx vitest run packages/server/src/agent/wakeCli.test.ts && npm run typecheck -w @tomato/server`
Expected: PASS, 3 tests ; `tsc` exit 0 (le dossier `scripts` est inclus par le `tsconfig.json` de la Task 1).

- [ ] **Step 5: Commit**

```bash
git add packages/server/src/agent/wakeCli.ts packages/server/src/agent/wakeCli.test.ts packages/server/scripts/wake.ts
git commit -m "feat(agent): script wake — réveil manuel et transcript de l'épisode dans data/episodes"
```

---

### Task 10: Vérification manuelle d'un épisode réel (`[GATE-5]`)

Prérequis : M5 mergé et branché (Task 8 cas a), sim de l'Étape 2 fonctionnelle, Claude Code connecté sur la machine (`~/.claude/.credentials.json` présent) **ou** `ANTHROPIC_API_KEY` exporté dans le terminal du serveur. Coût attendu : quelques dizaines de cents par épisode (trois images par `get_views`).

- [ ] **Step 1: Démarrer les processus (trois terminaux)**

```bash
npm run dev:server        # terminal 1 : MCP 7331, WS 7332, wake 7333 ; attendre la ligne "[agent] model claude-opus-5, MCP http://localhost:7331/mcp, manual wake on http://127.0.0.1:7333/wake/<tomatoId>"
npm run dev:sim           # terminal 2 : http://localhost:5173, ouvrir la page, vérifier "connecté" dans le bandeau
```

Dans la page sim, cliquer « mûrir la prochaine tomate » (ou `window.__tomato.runtime.apply({ type: 'ripen_next' })` dans la console) et noter l'identifiant de la tomate rouge. Si M4 est mergé, la détection réveille l'agent toute seule : observer l'épisode et passer au Step 3. Sinon :

- [ ] **Step 2: Réveil manuel**

```bash
npm run wake -w @tomato/server -- <tomatoId>      # terminal 3
```

Expected : `POST http://127.0.0.1:7333/wake/<id> -> 202 {"queued":true,...}`, `transcript: …/data/episodes/wake-<id>-<horodatage>.log`, puis `== episode … (new session)`, des lignes `[agent] …` (une à trois phrases avant chaque outil), `[tool ] get_views {}` / `[ ok  ] …`, et enfin `== end harvested|missed|aborted: …`. Dans le terminal 1, la ligne `[agent] session <uuid> model claude-opus-5 robot MCP connected auth <source>` confirme la connexion MCP et la source d'authentification (`none` = login Claude Code, `ANTHROPIC_API_KEY` = clé).

- [ ] **Step 3: Vérifier dans le dashboard et archiver**

Dans la page (M7 mergé : panneau de trace ; sinon la console du navigateur avec `bridge.onServerMessage`) : `episode_start`, les `agent_text`, les `tool_call_*`, les `views` rafraîchies, `episode_end` avec coût et durée. Relancer `npm run wake -- <autre id>` une seconde fois : la ligne `== episode … (resumed session)` prouve la reprise de session.

Conserver le fichier `data/episodes/wake-<id>-<horodatage>.log` (non suivi par git) : son chemin est la preuve de `[GATE-5]` dans la checklist et dans la description de la PR. Si le premier épisode échoue pour une raison de prompt (mauvaise lecture d'une vue, coupe ratée en boucle), **ne pas** retoucher le prompt dans cette PR : ouvrir une issue `ad-hoc` avec le transcript ; l'ajustement du prompt est le travail de l'Étape 4.

Dépannage : `robot MCP failed` dans la ligne de session → le serveur MCP de M5 ne répond pas sur `http://localhost:7331/mcp` (`curl -i http://localhost:7331/health`) ; `auth none` avec une erreur `Not logged in` → lancer `claude` une fois pour se connecter, ou exporter `ANTHROPIC_API_KEY` ; `error_max_turns` → l'agent a dépassé 50 tours, vérifier que la limite MCP de 40 appels de M5 répond bien « limite atteinte ».

---

### Task 11: Gates, checklist, PR

- [ ] **Step 1: Gates complets**

```bash
npm run lint && npm run typecheck && npm test && npm run build
```

Expected : quatre codes de retour 0 ; Vitest rapporte pour le projet `server` les fichiers `systemPrompt`, `streamToDashboard`, `wakePrompt`, `queryOptions`, `agentRunner`, `wakeServer`, `startAgent`, `wakeCli` (37 tests M6 + `index.test.ts`) tous verts. Vérifier `wc -l packages/server/src/agent/*.ts` : tous < 200 lignes.

- [ ] **Step 2: Cocher la checklist**

`docs/superpowers/specs/2026-09-17-etape-3-m6-agent-checklist.md` : cocher chaque `[SPEC-N]`, `[TEST-N]`, `[GATE-1..4]` avec la sortie fraîche sous les yeux ; `[GATE-5]` seulement avec le chemin du transcript de la Task 10 (sinon le laisser décoché et l'expliquer dans la PR : la PR reste ouverte jusqu'au merge de M5 et à la vérification manuelle).

- [ ] **Step 3: PR (selon `.claude/agents/builder.md`)**

```bash
git push -u origin feat/6-agent
gh pr create --base main --title "feat(agent): runner Claude Agent SDK, prompt système, réveil, streaming, limite d'appels" --body "Closes #6

Checklist: docs/superpowers/specs/2026-09-17-etape-3-m6-agent-checklist.md
Plan: docs/superpowers/plans/2026-09-17-etape-3-m6-agent.md

## Gates
lint OK, typecheck OK, test OK (<n> tests), build OK
GATE-5 : data/episodes/wake-<id>-<horodatage>.log (<outcome>, <n> tool calls, \$<coût>) — ou « en attente du merge de M5 »

## Hypothèses M5 vérifiées
<startEpisode / endEpisode / episode_end : conforme ou écart noté>"
gh issue edit 6 --remove-label todo --remove-label in-progress --add-label in-review
```

Écrire `data/build_verdict.json` comme demandé par `builder.md`.

---

## Auto-revue du plan

**Couverture du contrat M6 (architecture Étape 3) :** `createAgentRunner(deps: { hub; session; mcpUrl; model; systemPrompt })` → `AgentRunner { wake; busy; stop }` (Task 6, plus `whenIdle` et des dépendances optionnelles injectables) ; `@anthropic-ai/claude-agent-sdk` `query`, `mcpServers: { robot: { type: 'http', url } }`, `allowedTools: ['mcp__robot__*']`, aucun outil intégré, mode sans invite, `includePartialMessages` (Task 5) ; première session neuve puis `resume` (Task 6) ; conversion en `agent_text` (par bloc), `episode_start`, `episode_end` avec coût et durée du `result` (Tasks 3, 6) ; `tool_call_*` laissés au MCP ; `endEpisode('aborted', 'agent ended without report')` si pas de `report` (Task 6) ; file de réveils, un épisode à la fois (Task 6) ; prompt système complet dans `prompts/system.md` avec rôle, repère, unités, vues, couches d'annotation, ciseaux et ses deux axes, panier, verticale de chute, procédure en boucle fermée avec pas de 5 puis 1 cm, vérification dans la vue où la tige est dans le plan puis dans les deux autres, ouvrir, couper, `get_status`, `report`, raisonnement court avant chaque action, limite de 40 (Task 1) ; `scripts/wake.ts` + `npm run wake -w @tomato/server -- <tomatoId>` (Task 9) ; `index.ts` : runner branché sauf `TOMATO_AGENT=off`, réveil sur la phase `detected` (Task 8) ; `TOMATO_MODEL` défaut `claude-opus-5` (Task 8).

**Cohérence des types :** `AgentMessage` est vérifié par `tsc` comme sous-type de `SDKMessage` (Task 2) ; les fixtures des tests (Tasks 3, 6, 8) sont typées `AgentMessage`, donc conformes aux formes réelles ; `episode_start`/`episode_end`/`agent_text` sont construits contre `ServerToDashboard` de `@tomato/shared` ; `EpisodeOutcome` = l'union de `ToolSchemas.report.outcome` et d'`episode_end.outcome` ; `AgentSession`/`AgentHub`/`AgentSim` sont des sous-types structurels de `Session`/`Hub`/`SimBridge` de l'architecture (méthodes avec paramètres en moins acceptées par TypeScript) ; `buildQueryOptions` renvoie `Options` du SDK, donc chaque clé est vérifiée.

**Vérification effectuée par le rédacteur :** tout le code de ce plan a été écrit dans une copie du monorepo (scratchpad, `npm install` frais + `@anthropic-ai/claude-agent-sdk@0.3.275`, `ws`, `@types/ws`, `tsx`) et passé par `tsc --noEmit` (exit 0), `eslint packages/server` (exit 0) et `vitest run --project server` (38 tests verts, dont `index.test.ts`). Le binaire embarqué `claude.exe` répond `2.1.275 (Claude Code)`. Aucun appel réel au modèle n'a été fait (pas de coût engagé) ; la Task 10 le fait.

**Faits vérifiés sur le Claude Agent SDK (TypeScript)**

| Fait | Valeur vérifiée | Source |
|---|---|---|
| Package npm, version | `@anthropic-ai/claude-agent-sdk` 0.3.275 (dist-tag `latest`), `engines.node >= 18`, ESM (`sdk.mjs`, `sdk.d.ts`) | `npm view`, package.json installé ; https://code.claude.com/docs/en/agent-sdk/typescript |
| Binaire | Embarqué par dépendance optionnelle `@anthropic-ai/claude-agent-sdk-win32-x64` (`claude.exe`, 2.1.275) ; pas d'installation séparée sauf `--omit=optional` (alors `pathToClaudeCodeExecutable`) | https://code.claude.com/docs/en/agent-sdk/quickstart |
| Peer deps | `zod ^4.0.0`, `@anthropic-ai/sdk >= 0.93.0`, `@modelcontextprotocol/sdk ^1.29.0` ; npm installe `zod@4.6.5` imbriqué sous le SDK et garde `zod@3.25.x` pour `@tomato/shared` (pas d'ERESOLVE, `sdk.mjs` n'importe pas `zod` statiquement) | installation dans le scratchpad, `npm ls zod` |
| Signature | `query({ prompt: string \| AsyncIterable<SDKUserMessage>, options?: Options }): Query` ; `Query extends AsyncGenerator<SDKMessage, void>` + `interrupt()`, `setPermissionMode()`, `mcpServerStatus()`, `close()`… | sdk.d.ts l. 3034 ; https://code.claude.com/docs/en/agent-sdk/typescript |
| MCP HTTP | `mcpServers: Record<string, McpServerConfig>` ; `McpHttpServerConfig = { type: 'http'; url; headers?; tools?; timeout?; alwaysLoad? }` (`streamable-http` accepté seulement en JSON, pas en code) | sdk.d.ts l. 1110 ; https://code.claude.com/docs/en/agent-sdk/mcp |
| Nom des outils MCP, wildcard | `mcp__<server>__<tool>` ; `allowedTools: ['mcp__robot__*']` (glob autorisé seulement après un préfixe `mcp__<server>__` littéral) | https://code.claude.com/docs/en/agent-sdk/mcp ; https://code.claude.com/docs/en/agent-sdk/permissions |
| Mode sans invite | `PermissionMode = 'default' \| 'acceptEdits' \| 'bypassPermissions' \| 'plan' \| 'dontAsk' \| 'auto'` ; `dontAsk` refuse tout ce qui demanderait une invite (recommandé avec `allowedTools`) ; `bypassPermissions` exige `allowDangerouslySkipPermissions: true` et approuve *tout* (non retenu) | sdk.d.ts l. 2380, 1898, 1910 ; https://code.claude.com/docs/en/agent-sdk/permissions |
| Outils intégrés | `tools?: string[] \| { type: 'preset'; preset: 'claude_code' }` ; `[]` = aucun outil intégré | sdk.d.ts l. 1568 |
| Prompt système | `systemPrompt?: string \| string[] \| { type: 'custom'; prompt; snapshot? } \| { type: 'preset'; preset: 'claude_code'; append?; excludeDynamicSections?; snapshot? }` ; une chaîne remplace entièrement le prompt de Claude Code | sdk.d.ts l. 2301 ; https://code.claude.com/docs/en/agent-sdk/typescript |
| Autres options utilisées | `model?: string`, `maxTurns?: number`, `includePartialMessages?: boolean`, `resume?: string`, `continue?: boolean`, `forkSession?`, `persistSession?: boolean` (défaut true), `settingSources?: SettingSource[]` (`[]` = isolation), `strictMcpConfig?: boolean`, `abortController?: AbortController`, `env?: { [k: string]: string \| undefined }` (**remplace** l'environnement du sous-processus : spread de `process.env` obligatoire), `stderr?: (data: string) => void`, `maxBudgetUsd?: number` (non utilisé) | sdk.d.ts l. 1454–2320 |
| Messages | `SDKMessage` = union ; utilisés : `system`/`init` (`session_id`, `model`, `tools`, `mcp_servers: { name; status; source? }[]`, `apiKeySource`, `permissionMode`), `assistant` (`message: BetaMessage`, un message par bloc de contenu complet ; `parent_tool_use_id`), `user` (résultats d'outils, ignorés), `stream_event` (`event: BetaRawMessageStreamEvent` ; texte dans `content_block_delta` → `delta.type === 'text_delta'` → `delta.text`), `result` (`SDKResultSuccess \| SDKResultError` : `subtype` `success` / `error_during_execution` / `error_max_turns` / `error_max_budget_usd` / `error_max_structured_output_retries`, `total_cost_usd`, `duration_ms`, `duration_api_ms`, `num_turns`, `is_error`, `session_id`, `usage`, `modelUsage`) | sdk.d.ts l. 5019, 5164, 5340–5470, 5565 ; https://code.claude.com/docs/en/agent-sdk/streaming-output |
| Session | `session_id` dans le message `init` (avant tout) et dans chaque `result` ; `resume: sessionId` reprend ; transcripts dans `~/.claude/projects/<cwd encodé>/*.jsonl` ; un `query()` mono-prompt lève après un `result` d'erreur (d'où le `try/catch` du runner) | https://code.claude.com/docs/en/agent-sdk/sessions |
| Images MCP | Les résultats d'outils MCP peuvent contenir des images ; les résultats **avec** images restent soumis à `MAX_MCP_OUTPUT_TOKENS` (défaut 25 000 tokens, avertissement à 10 000) et ne sont pas déportés dans un fichier ; `anthropic/maxResultSizeChars` ne couvre que le texte → `env.MAX_MCP_OUTPUT_TOKENS = '400000'` | https://code.claude.com/docs/en/mcp (« MCP output limits and warnings ») |
| Connexion MCP | Un serveur HTTP dans `options.mcpServers` retarde le premier tour jusqu'à sa connexion (`MCP_TIMEOUT`, 30 s) ; statut dans `init.mcp_servers[].status` (`connected`, `pending`, `failed`, `needs-auth`) ; `alwaysLoad: true` met les schémas dans le prompt dès le tour 1 | https://code.claude.com/docs/en/agent-sdk/mcp (« Connection timing ») |
| Authentification | `ANTHROPIC_API_KEY` dans l'environnement du processus (le SDK ne lit pas `.env`) ; sinon le binaire embarqué lit les identifiants du Claude Code local (`~/.claude/.credentials.json`, présent sur cette machine ; `apiKeySource: 'none'` dans `init` = OAuth claude.ai) ; alternatives `CLAUDE_CODE_USE_BEDROCK` / `VERTEX` / `FOUNDRY` ; `claude setup-token` génère un jeton OAuth longue durée (la variable `CLAUDE_CODE_OAUTH_TOKEN` apparaît 62 fois dans `claude.exe` mais n'est pas documentée sur les pages consultées : non retenue). Note de la doc : Anthropic n'autorise pas les produits tiers à offrir le login claude.ai ; ici, usage personnel de développement | https://code.claude.com/docs/en/agent-sdk/quickstart ; https://code.claude.com/docs/en/agent-sdk/overview ; https://code.claude.com/docs/en/cli-reference ; https://code.claude.com/docs/en/env-vars |
| Modèle | `model` accepte un alias ou un identifiant complet ; `claude-opus-5` est l'identifiant Opus 5 courant (skill `claude-api`, table des modèles) ; surcharge par `TOMATO_MODEL` | https://code.claude.com/docs/en/cli-reference (`--model`) |
| Fallback CLI (non retenu, documenté) | `claude -p "<prompt>" --output-format stream-json --verbose --include-partial-messages --mcp-config '{"mcpServers":{"robot":{"type":"http","url":"http://localhost:7331/mcp"}}}' --strict-mcp-config --allowedTools "mcp__robot__*" --permission-mode dontAsk --system-prompt-file prompts/system.md --model claude-opus-5 --max-turns 50 [--resume <session_id>]` ; une ligne JSON par message, mêmes types (`system`, `assistant`, `user`, `result`, `stream_event`) : `streamToDashboard` s'applique tel quel après `JSON.parse` + `toAgentMessage`. À n'utiliser que si le SDK se révélait inutilisable ; le binaire à lancer est celui du package `-win32-x64` | https://code.claude.com/docs/en/headless ; https://code.claude.com/docs/en/cli-reference |

**Non vérifié / risques :**

1. **Contrat M5 en parallèle** : ordre `episode_end` / `endEpisode`, qui appelle `startEpisode`, `onPhase` (voir « Hypothèses sur M5 » et Task 8). Atténué par les gardes du runner (`episodeId === null` avant `startEpisode`, `episodeId !== null` avant `endEpisode`, doublons de réveil ignorés).
2. **Comptage des tokens d'image** : la doc ne dit pas comment un PNG base64 est compté vers `MAX_MCP_OUTPUT_TOKENS` ; `400000` est une marge large. Si le premier `get_views` réel renvoie un avertissement ou une erreur de taille, augmenter la valeur ou réduire la taille des PNG (M3) ; c'est l'un des premiers points de la Task 10.
3. **Coût et latence** : trois images de 800×800 par `get_views`, 12 à 20 appels par épisode : plusieurs minutes et quelques dizaines de cents par épisode (acceptable en vidéo, spec section 11).
4. **Reprise de session** : `resume` échoue si le transcript a disparu (`~/.claude/projects/`) ; le runner repart alors à neuf au lieu de bloquer.
5. **`maxTurns: 50`** : si M5 ne renvoie pas « limite atteinte » au-delà de 40 appels, l'épisode s'arrête en `error_max_turns` → `aborted` (comportement voulu, pas de boucle infinie).
6. **`tools: []` et le tour 1** : avec zéro outil intégré, le « tool search » est sans objet ; `alwaysLoad: true` garantit que les neuf schémas sont présents. Si `init.mcp_servers` montre `pending` au premier tour (liste d'outils en cache d'une connexion précédente), c'est normal : la connexion se fait au premier appel.
7. **Version du SDK** : `^0.3.275` ; le SDK évolue vite (l'API V2 `createSession` a été retirée en 0.3.142). Ne pas monter de version majeure sans refaire `tsc` sur `sdkQuery.ts` et `queryOptions.ts`, qui sont les deux garde-fous de compilation.
