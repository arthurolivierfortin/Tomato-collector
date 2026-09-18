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

`playwright install` n'est nécessaire que pour `npm run shot` (capture automatisée) ; pas pour lancer la démo.

## Lancer la démo

Prérequis : Claude Code CLI connecté (l'agent utilise l'auth de la machine).

    npm run demo

Ouvrir http://localhost:5173 et attendre **serveur connecté** dans le bandeau du haut.

Une seule tomate mûrit à la fois : la première démarre sa rampe 3 s après le chargement du plant,
la suivante 4 s après que la précédente a été coupée ou est tombée. La rampe vert → rouge dure
15 s sim : à ×1, il s'écoule donc une vingtaine de secondes entre deux épisodes.

Déroulé d'un épisode :

1. Attendre que la tomate en cours rougisse, ou cliquer « Mûrir la prochaine tomate » pour l'y forcer.
2. La perception (contours HSV ou détecteur ONNX) détecte la tomate mûre.
3. Le serveur réveille l'agent (phase `detected` → réveil automatique de la file du runner) ; le schéma
   bloc s'allume perception → serveur (« tomate #3 mûre, yolo 0,56 ») puis serveur → agent (« réveil »).
4. Suivre la trace dans le panneau de droite (texte de l'agent, appels d'outils MCP, résultats) jusqu'à `harvested` ou `missed`.

Le serveur diffuse aussi le flux brut de la session Claude Code (`agent_raw` : `init` avec l'identifiant
de session et le statut du MCP robot, `tool_use`, `tool_result`, `text`, `result`, `stderr`) et un
événement de réveil explicite (`agent_wake` : tomate, détecteur, confiance). `npm run wake` les écrit
dans son transcript ; le panneau « Session agent (brut) » du dashboard viendra les afficher.

Réveil manuel, sans attendre la détection (utile aussi avec `TOMATO_AGENT=off`) :

    npm run wake -w @tomato/server -- <tomatoId>

Variables d'environnement du serveur (`TOMATO_*`, valeurs par défaut) :

| Variable | Défaut | Effet |
|---|---|---|
| `TOMATO_MCP_PORT` | `7331` | port HTTP : `/mcp`, `/health`, `/episodes` |
| `TOMATO_WS_PORT` | `7332` | port WebSocket (hub sim + dashboards) |
| `TOMATO_WAKE_PORT` | `7333` | port du serveur de réveil manuel (`npm run wake`) |
| `TOMATO_MODEL` | `claude-opus-5` | modèle de l'agent |
| `TOMATO_AGENT` | `on` | `off` désactive le runner (pilotage à la main uniquement) |
| `TOMATO_EPISODES_DIR` | `data/episodes` | dossier des journaux d'épisodes |
| `TOMATO_TOOL_PACING_MS` | `1500` | durée minimale d'un appel d'outil, pour qu'il reste lisible à l'écran (`0` = aucun rythme ; `report` n'est jamais retardé) |

Variables d'environnement de la sim (Vite, `VITE_*`) :

| Variable | Défaut | Effet |
|---|---|---|
| `VITE_TOMATO_WS_URL` | `ws://localhost:7332` | hub WebSocket contacté par la page |
| `VITE_TOMATO_API_URL` | `http://localhost:7331` | serveur HTTP (liste et lecture des épisodes) |

Pour positionner une variable ponctuellement : bash `TOMATO_MODEL=claude-sonnet-5 npm run demo` ;
PowerShell `$env:TOMATO_MODEL = "claude-sonnet-5"; npm run demo`.

Touches du dashboard : `h` masque/affiche les contrôles, `v` bascule la vue « ce que voit l'agent »,
`b` ouvre/ferme le schéma bloc (flux agent ↔ serveur ↔ sim), `c` affiche/masque les gizmos des trois caméras dans la vue 3D.

Replay : le panneau « Épisodes », à côté des contrôles, liste les journaux de `data/episodes/` ;
choisir un épisode et une vitesse puis « Rejouer » le repasse via un pont simulé, sans serveur ni agent.

Journaux et coût : chaque épisode est écrit dans `data/episodes/<episodeId>.json` (messages horodatés,
appels d'outils, résultat, coût). Coût observé pour un épisode complet mené par l'agent : environ 0,35 $.

## Tournage

- Résolution recommandée : 1920×1080 (redimensionner la fenêtre avant d'enregistrer).
- `v` : mode « ce que voit l'agent » (vues caméra agrandies à 70 % de l'écran).
- `h` : masque les contrôles pour un cadrage propre.
- `b` : ouvre le schéma bloc en bandeau bas, utile pour montrer le flux agent ↔ serveur ↔ sim.
- `c` : affiche les gizmos des trois caméras (masqués par défaut), utile pour expliquer d'où viennent les vues.
- Vitesse ×1 pendant l'épisode : les vitesses ×2/×5/×10 accélèrent la simulation mais brouillent la prise.
- Les mouvements sont animés : l'outil ne répond qu'une fois le bras arrivé. Vitesses en temps sim (donc
  multipliées par le facteur ×2/×5/×10) : ciseaux et panier 15 cm/s, rotations 45°/s, caméras 20 cm/s et
  45°/s, ouverture ou fermeture des lames 0,5 s. Elles se règlent dans `packages/sim/src/core/speeds.ts`.
- Ne pas mettre en pause ni changer la vitesse pendant un appel d'outil : le serveur attend la fin du
  mouvement en temps réel (30 s au maximum), et une sim gelée le fait expirer.
- « Nouveau plant » entre deux prises pour repartir d'un plant frais.
- Ne pas fermer l'onglet : la simulation (Three.js + Rapier) vit dans la page ; la fermer arrête tout.

## Dépannage

- `'concurrently' is not recognized` (ou tout binaire manquant) : les dépendances ont changé depuis ton dernier `npm install`. Refaire `npm install` à la racine après chaque `git pull`.

- Port occupé (`EADDRINUSE`) : un serveur ou une sim précédente tourne encore. Identifier et arrêter le
  processus (Windows : `netstat -ano | findstr :7331` puis `taskkill /PID <pid> /F` ; répéter pour 7332,
  7333, 5173).
- `simConnected:false` dans `GET /health`, ou vue spectateur vide : la page http://localhost:5173 n'est
  pas ouverte ou n'a pas encore établi le WebSocket ; ouvrir ou recharger la page.
- L'agent ne se réveille jamais : vérifier `TOMATO_AGENT` (doit être `on` ou absent), que Claude Code CLI
  est connecté, et la ligne « prêt » du log serveur (elle indique `agent on/off` et le modèle).
- Modèle ONNX absent (`packages/sim/public/models/tomato-ripe.onnx`) : la démo fonctionne sans, la
  perception retombe sur la détection par contours HSV. Pour l'exporter : `python scripts/export-yolo.py`
  (dépendances et licence détaillées en en-tête du script).
- Sous Windows, `npm run demo` démarre le serveur avec `npm run start -w @tomato/server` (sans
  rechargement à chaud) plutôt que `npm run dev -w @tomato/server` : `tsx watch` bloque au démarrage une
  fois relayé par `concurrently` sur cette plateforme (le process reste sur « démarrage », `/health` ne
  répond jamais). Pour du rechargement à chaud pendant le développement, lancer `npm run dev:server` seul.

## Commandes

| Commande | Effet |
|---|---|
| `npm run demo` | serveur + sim ensemble (agent actif), démo prête sur http://localhost:5173 |
| `npm run demo:noagent` | idem, agent désactivé (`TOMATO_AGENT=off`), pilotage à la main |
| `npm run dev:sim` | page sim + dashboard seule sur http://localhost:5173 |
| `npm run dev:server` | serveur MCP + WebSocket seul, avec rechargement à chaud |
| `npm run wake -w @tomato/server -- <tomatoId>` | réveil manuel de l'agent pour une tomate |
| `npm run shot` | capture Playwright de la scène dans `data/shots/` |
| `npm run lint` / `npm run typecheck` / `npm test` / `npm run build` | les quatre gates, obligatoires avant toute PR |

## Structure

    packages/shared            contrats : types, schémas zod des outils MCP, machine à états, monde par défaut
    packages/sim               page navigateur (Three.js + Rapier, React)
      src/plant, robot, cameras   plant, bras à ciseaux, panier, trois caméras
      src/perception              détection HSV / ONNX de la maturité, annotations
      src/bridge                  pont WebSocket vers le serveur (état, actions, vues)
      src/dashboard               dashboard React : bandeau, trace, replay, schéma bloc, contrôles
    packages/server            Node
      src/mcp                     serveur MCP streamable HTTP (outils du robot)
      src/hub                     hub WebSocket (sim et dashboards)
      src/agent                   runner d'agent Claude, réveil, serveur de réveil manuel
      src/episodes                journal des épisodes (`data/episodes/`)
    docs/                      spec, plans, STATUS.md
    .claude/                   agents et skills du cycle de développement

## Conventions

- Unités : centimètres et degrés partout. Repère monde : X droite, Y arrière, Z haut, origine au pied du plant.
  Dans Three.js, 1 unité = 1 cm ; conversion unique dans `packages/sim/src/three/frame.ts`.
- TypeScript strict, pas de `any`, imports de types explicites.
- TDD : test qui échoue, puis implémentation minimale. Les fonctions de géométrie et de règles sont pures et testées sans navigateur.
- Un module par PR, rebase merge sur `main`, jamais de push direct sur `main` après l'Étape 1.
- Les erreurs renvoyées à l'agent sont des retours structurés (`ok: false, error, message, details`), jamais des exceptions.
- `packages/shared` est figé après l'Étape 1 : un module qui doit le modifier le dit dans sa checklist, sinon la PR est refusée.

## Cycle de développement

Le développement suit un cycle adapté de Marcel (spec, section 7) :

1. `/plan` crée une issue GitHub par module à partir du plan de l'étape (`docs/superpowers/plans/`).
2. `/cycle` prend l'issue suivante de l'étape courante (`docs/STATUS.md`), dispatche un builder dans un worktree,
   puis un judge, puis un visual-checker si la PR touche au rendu, puis merge et nettoie.
3. `/status` résume l'état ; `/checkpoint` sauvegarde la session avant un `/compact`.

Les étapes et leurs conditions de passage sont dans la spec, section 9, et suivies dans `docs/STATUS.md`.
Les modules d'une même étape se construisent en parallèle (un `/cycle` par module).

## Piloter le robot à la main (à partir de l'Étape 3)

Le serveur MCP écoute sur `http://localhost:7331/mcp`. Pour l'ajouter à Claude Code interactif :

    claude mcp add --transport http tomato-robot http://localhost:7331/mcp

Puis, dans une session Claude Code, demander par exemple « regarde les trois vues et déplace le panier sous la tomate 2 ».
