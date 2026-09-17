# Étape 3 — Architecture interne (contrat entre M4 perception, M5 serveur, M6 agent, M7 dashboard)

Ce document fixe ce que les quatre modules de l'Étape 3 partagent. Il complète `2026-09-17-etape-2-architecture.md` (socle sim, modules plant/robot/cameras) et la spec (sections 3, 4.4, 5, 6). Un module qui a besoin d'autre chose le dit dans sa checklist.

## Processus et ports

| Processus | Rôle | Port |
|---|---|---|
| `packages/sim` (Vite) | page sim + dashboard | 5173 |
| `packages/server` (Node 22, `tsx`) | MCP streamable HTTP | `http://localhost:7331/mcp` |
| idem | hub WebSocket (sim et dashboards) | `ws://localhost:7332` |
| idem | HTTP annexe : `GET /health`, `GET /episodes`, `GET /episodes/:id` | 7331 |

Scripts : racine `dev:server` = `npm run dev -w @tomato/server` ; `@tomato/server` : `dev` = `tsx watch src/index.ts`, `start` = `tsx src/index.ts`, `typecheck`/`build` = `tsc --noEmit`. Dépendances serveur : `@modelcontextprotocol/sdk`, `express`, `ws`, `@anthropic-ai/claude-agent-sdk`, `zod` (déjà), `tsx` (dev). Les versions et les API réelles sont vérifiées par le rédacteur de plan sur npm et la doc officielle avant d'écrire du code.

## Répartition des dossiers

| Module | Dossier(s) | Peut toucher aussi |
|---|---|---|
| M4 perception | `packages/sim/src/perception/` | `packages/sim/src/cameras/renderViews.ts` (uniquement pour ajouter `setEdgeFilter` et `renderCameraImage` s'ils manquent), `packages/sim/package.json`, `packages/sim/public/models/`, ligne MODULES de `App.tsx` |
| M5 serveur | `packages/server/src/**` | `packages/sim/src/bridge/` (client WebSocket côté sim), ligne d'appel du bridge dans `App.tsx`, `package.json` racine (`dev:server`) |
| M6 agent | `packages/server/src/agent/**`, `packages/server/prompts/` | `packages/server/src/index.ts` (branchement du runner), `packages/server/package.json` |
| M7 dashboard | `packages/sim/src/dashboard/**` | `App.tsx` (réécriture de la mise en page, en gardant `SpectatorView`, `AgentViews`, le runtime et le bridge), `packages/sim/src/styles.css` |

M4, M5, M6 démarrent dès la fin de l'Étape 2. M7 démarre en même temps mais développe contre une interface de bridge simulée (voir plus bas) jusqu'au merge de M5.

## Serveur (M5) — composants

### Hub WebSocket (`server/src/hub/`)

- `createHub(port) → Hub` avec `Hub { onSimMessage(fn: (m: SimToServer) => void); sendToSim(m: ServerToSim): boolean; broadcast(m: ServerToDashboard): void; simConnected(): boolean; close(): void }`.
- Chaque client envoie d'abord `ClientHello`. Un seul client `sim` à la fois (le nouveau remplace l'ancien). `ServerToDashboard` est diffusé à TOUS les clients connectés (la page sim est aussi le dashboard). À la connexion d'un client, le hub envoie un `snapshot`.
- Messages décodés par `parseMessage` de `@tomato/shared` ; message inconnu ignoré et journalisé.

### Pont vers la sim (`server/src/sim/simBridge.ts`)

- `createSimBridge(hub) → SimBridge` avec `SimBridge { apply(action: SimAction): Promise<ActionResult>; renderViews(cameras: CameraId[]): Promise<ViewsResult>; latestState(): WorldState | null; onEvent(fn: (e: SimEvent) => void): () => void }`.
- Corrélation par `requestId` (`crypto.randomUUID()`), timeout 15 s → `fail(latestState ?? createDefaultWorld(0), 'not_available', 'simulation did not answer')`. Sans client sim connecté → même erreur immédiate. Le dernier `state` reçu est mémorisé.

### État de session et phases (`server/src/state/`)

- `SessionState { phase: Phase; episodeId: string | null; targetTomatoId: number | null; lastEvent: SimEvent | null; harvested: number; missed: number; toolCallsThisEpisode: number }`.
- `createSession(hub) → Session` avec `Session { get(); setPhase(to: Phase, reason: string) (via transition de shared ; erreur = journalisée et ignorée, jamais lancée vers l'agent) ; startEpisode(tomatoId) ; endEpisode(outcome, note) ; onPhase(fn) }`. Chaque changement de phase diffuse `{ type: 'phase', phase, reason }` et `block_activity`.
- Règles : `ripe_detected` en `idle` → `detected` + `set_target` envoyé à la sim + réveil de l'agent (M6) ; premier tool call de mouvement → `harvesting` ; `cut` réussi → `cutting` puis `falling` ; `tomato_landed` → `harvested` ou `missed` ; `report` → retour `idle` (après `harvested`/`missed`, ou `aborted` si l'agent abandonne). Si `ripe_detected` arrive hors `idle`, il est mis en file d'attente et rejoué au retour en `idle`.

### Journal des épisodes (`server/src/episodes/`)

- Un fichier `data/episodes/<episodeId>.json` par épisode : `{ episodeId, tomatoId, startedAt, endedAt, outcome, note, messages: ServerToDashboard[] (horodatés : { atMs, message }), toolCalls, costUsd }`. Les images des `views` sont conservées (base64) pour le replay. `GET /episodes` liste `{ episodeId, startedAt, outcome, tomatoId }`, `GET /episodes/:id` renvoie le fichier.

### MCP (`server/src/mcp/`)

- `createMcpServer(deps: { sim: SimBridge; session: Session; hub: Hub }) → McpServer` avec les neuf outils, noms et descriptions de `TOOL_DESCRIPTIONS`, schémas de `ToolSchemas` (`@tomato/shared`). Transport streamable HTTP monté sur Express à `/mcp` (mode sans session ou avec session, au choix du rédacteur après lecture de la doc du SDK ; documenter).
- Chaque appel : `hub.broadcast(tool_call_start)` → exécution → `hub.broadcast(tool_call_result)` avec `durationMs` et un `summary` d'une ligne en français (« ciseaux vers X 12, Y 4, Z 38 », « coupe : misaligned, 1,4 cm, 62° »). Le compteur `toolCallsThisEpisode` s'incrémente ; au-delà de `MAX_TOOL_CALLS_PER_EPISODE`, tout outil sauf `report` renvoie un texte « limite atteinte, appelle report ».
- Formats de retour : `get_status` → texte JSON compact (phase, tomates, poses, limites, dernier événement) ; `get_views` → pour chaque caméra un bloc image PNG base64 précédé d'un bloc texte « Vue front — axes X→ Z↑ — 8 px/cm », puis un bloc texte avec le JSON `ViewsPayload` ; outils de mouvement → texte `ActionResult` (ok/erreur, message, details) et, pour `move_camera`, l'image rafraîchie de cette caméra ; `cut` → texte du résultat ; `report` → texte d'accusé. Aucun outil ne lance d'exception : les erreurs de validation zod deviennent un texte « invalid_argument : … ».
- `episodeId` des messages diffusés = `session.get().episodeId ?? 'manual'` (pilotage à la main depuis Claude Code interactif).

### Point d'entrée (`server/src/index.ts`)

Crée hub, bridge, session, journal, MCP + Express, puis (M6) le runner d'agent. Variables d'environnement : `TOMATO_MCP_PORT` (7331), `TOMATO_WS_PORT` (7332), `TOMATO_MODEL` (défaut `claude-opus-5`), `TOMATO_AGENT` (`on`/`off`, défaut `on`).

## Pont côté sim (M5, `packages/sim/src/bridge/`)

- `createBridge(opts: { url: string; runtime: SimRuntime; renderViews: (cams: CameraId[]) => Promise<ViewsResult> }) → Bridge` avec `Bridge { onServerMessage(fn: (m: ServerToDashboard) => void): () => void; status(): 'connected' | 'disconnected'; onStatus(fn) ; close() }`.
- À la connexion : `hello { role: 'sim' }`, puis `state` à chaque changement du store, limité à 5 Hz, plus immédiatement après chaque `action_result`. Relaie `runtime.onEvent` en `sim_event`. Répond à `apply_action` par `action_result` (via `runtime.apply`) et à `render_views` par `views_result`. Reconnexion automatique toutes les 2 s.
- **Interface simulée pour M7** : `createFakeBridge(script: { atMs: number; message: ServerToDashboard }[]) → Bridge` qui rejoue un scénario ; M7 l'utilise dans ses tests et dans le mode replay.

## Perception (M4, `packages/sim/src/perception/`)

- `perceptionModule: SimModule` (nom `perception`), ajouté à `MODULES` après `cameraModule`.
- **Contours** : `createCannyClaheFilter(cv) → EdgeFilter` (OpenCV.js chargé une fois de façon asynchrone ; package npm WASM sans dépendance native, par exemple `@techstark/opencv-js`, à vérifier). Tant qu'OpenCV n'est pas chargé, le filtre Sobel de M3 reste actif. M4 appelle `setEdgeFilter(filter)` exposé par `cameras/renderViews.ts` ; si cette fonction n'existe pas après le merge de M3, M4 l'ajoute (fonction d'une ligne qui remplace le filtre courant du renderer).
- **Détecteur mûr** : à 2 Hz sim, sur l'image brute de la caméra `front` réduite à 640 px (`renderCameraImage('front')` exposé par M3, sinon ajouté par M4 dans `cameras/`). Deux détecteurs derrière une même interface `RipeDetector = (img: ImageData) => Detection[]` avec `Detection { bbox: [x, y, w, h]; score: number; label: 'ripe' | 'unripe' }` : `hsvDetector` (pur, testé : masque rouge, ouverture morphologique simple, composantes connexes, aire minimale) et `yoloDetector` (onnxruntime-web, modèle `public/models/tomato-ripe.onnx` ; si le fichier ou la bibliothèque manque au chargement, le module journalise et utilise HSV). Le dashboard reçoit quel détecteur a déclenché (`detector` de l'événement).
- **Association et réveil** (pur, testé) : `matchDetections(detections, tomatoes, project: (posCm) => [px, py]) → { tomatoId, score }[]` par distance au centre projeté ; `createWakeGate(n = 5) → { push(tomatoId | null): number | null }` qui renvoie un `tomatoId` quand il a été vu `ripe` `n` fois de suite ; garde-fou vérité terrain (`tomato.state === 'ripe'`, désactivable par option) ; puis `ctx.emitEvent({ type: 'ripe_detected', tomatoId, detector, confidence })` une seule fois par tomate (jusqu'à `new_plant`).
- Exporte `perceptionState()` pour le dashboard : `{ opencvReady: boolean; yoloReady: boolean; lastDetector: 'yolo' | 'hsv' | null; lastDetections: Detection[] }`.

## Runner d'agent (M6, `packages/server/src/agent/`)

- `createAgentRunner(deps: { hub: Hub; session: Session; mcpUrl: string; model: string; systemPrompt: string }) → AgentRunner` avec `AgentRunner { wake(event: { tomatoId: number; positionCm: Vec3; ripeness: number }): void; busy(): boolean; stop(): void }`.
- Implémentation avec `@anthropic-ai/claude-agent-sdk` (`query`), serveur MCP déclaré en HTTP (`mcpServers: { robot: { type: 'http', url } }`), outils autorisés limités à `mcp__robot__*`, aucun outil intégré, mode de permission sans invite, `includePartialMessages` pour le texte en continu. Premier épisode : nouvelle session ; suivants : `resume` avec l'identifiant de session mémorisé. Le rédacteur de plan vérifie ces noms d'options dans la doc officielle (https://code.claude.com/docs/en/agent-sdk/) et n'invente rien.
- Conversion du flux en messages `agent_text` (texte agrégé par bloc), `episode_start`, `episode_end` (coût et durée depuis le message `result`). Les `tool_call_*` viennent du MCP, pas du runner (évite les doublons). Si l'agent termine sans appeler `report`, le runner appelle `session.endEpisode('aborted', 'agent ended without report')`.
- File d'attente des réveils : un seul épisode à la fois ; un réveil pendant un épisode est rejoué après `episode_end`.
- **Prompt système** dans `packages/server/prompts/system.md` (français ou anglais, au choix ; l'agent lit les images de toute façon) : rôle, repère monde et unités, sémantique de chaque vue et de chaque couche d'annotation (grille, marqueurs, tige cyan, schéma des ciseaux et de ses deux axes, panier jaune, verticale de chute pointillée), procédure recommandée en boucle fermée (regarder ; panier sous le point d'impact prédit ; approche des ciseaux par pas de 5 cm puis 1 cm ; vérifier dans la vue où la tige est dans le plan que le plan des lames est perpendiculaire à la tige, et dans les deux autres que la croix du point de coupe est sur la tige ; ouvrir ; couper ; vérifier `tomato_landed` via `get_status` ; `report`), raisonnement court et explicite avant chaque action, limite de 40 appels.
- Un script `packages/server/scripts/wake.ts` (`npm run wake -w @tomato/server -- <tomatoId>`) déclenche un réveil à la main pour le tournage et le débogage.

## Dashboard (M7, `packages/sim/src/dashboard/`)

- État du dashboard dans un store React léger (`useSyncExternalStore` ou `useReducer` + contexte) alimenté par `Bridge.onServerMessage` : `{ connection, phase, episode: { id, tomatoId, startedAt } | null, counters, trace: TraceEntry[] (plus récent en tête, max 200), views: Record<CameraId, ViewImage | null>, lastViewsAt, blocks: { active: BlockId | null; flow: { from, to } | null }, cost, model }`. `TraceEntry` = `{ kind: 'text' | 'tool' | 'event' | 'phase'; atMs; title; detail?; ok?; durationMs? }`.
- Mise en page spec section 6 : gauche 55 % `SpectatorView` ; droite haut `AgentViews` (M3) enrichie du flash à chaque `views` ; droite bas `TracePanel` ; bandeau haut `StatusBar` (pastilles de phase, compteurs, temps sim et facteur, modèle, coût, état de connexion et détecteur actif via `perceptionState()` si M4 est mergé, sinon « HSV/Sobel ») ; bandeau bas repliable `BlockDiagram` (SVG inline : Simulation → Perception → Serveur MCP → Agent → Dashboard, bus ; bloc et flèche actifs allumés 600 ms sur `block_activity`).
- `Controls` : pause, vitesse (1, 2, 5, 10), « mûrir la prochaine tomate » (`runtime.apply({ type: 'ripen_next' })`), « nouveau plant », « masquer les contrôles » (touche `h`), mode « ce que voit l'agent » (touche `v` : vues agrandies, vue 3D réduite). Replay : liste depuis `GET /episodes`, lecture d'un épisode par `createFakeBridge` avec la vitesse choisie.
- Tests Vitest (Node + `@testing-library/react` ou tests purs sur le réducteur) : réducteur du store (chaque type de message met à jour le bon champ), mise en forme des entrées de trace, gestion du flash. Playwright : `dashboard.spec.ts` charge la page, injecte un scénario via `window.__tomato.fakeBridge` (exposé en dev) et capture `data/shots/dashboard.png` à 1920×1080.
- Esthétique : sombre, sobre, palette de la spec ; typographie monospace pour les nombres ; aucun élément décoratif.

## Vérification de fin d'étape (spec section 9)

Test d'intégration serveur (Vitest, `packages/server/src/integration/episode.test.ts`) : hub + bridge + session + MCP montés en mémoire avec un faux client sim (répond aux actions avec un monde scripté), un script d'appels d'outils (`get_views` → `move_basket` → `move_scissors` ×3 → `open_scissors` → `cut` → `report`) aboutit en `harvested` ; le même script avec le panier mal placé aboutit en `missed` ; le journal d'épisode est écrit. Et, dans le navigateur, le dashboard affiche la trace et les vues d'un épisode rejoué.
