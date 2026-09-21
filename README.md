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

Réveil manuel, sans attendre la détection (le serveur de réveil écoute sur `TOMATO_WAKE_PORT` dans
les deux modes) :

    npm run wake -w @tomato/server -- <tomatoId>

Avec `TOMATO_AGENT=off`, le réveil est *mis en scène* et rien n'est demandé au SDK : le serveur ouvre
l'épisode (phase `detected`, journal, blocs perception → serveur → agent, `agent_wake` avec le détecteur
`manual`) puis rend la main. Le robot reste à piloter à la main, outil par outil, depuis Claude Code —
utile pour répéter la mise en scène sans dépenser.

Variables d'environnement du serveur (`TOMATO_*`, valeurs par défaut) :

| Variable | Défaut | Effet |
|---|---|---|
| `TOMATO_MCP_PORT` | `7331` | port HTTP : `/mcp`, `/health`, `/episodes` |
| `TOMATO_WS_PORT` | `7332` | port WebSocket (hub sim + dashboards) |
| `TOMATO_WAKE_PORT` | `7333` | port du serveur de réveil manuel (`npm run wake`) |
| `TOMATO_MODEL` | `claude-opus-5` | modèle de l'agent |
| `TOMATO_AGENT` | `on` | `off` désactive le runner (pilotage à la main) ; le réveil manuel reste servi, mis en scène sans SDK |
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
`b` ouvre/ferme le schéma bloc (flux agent ↔ serveur ↔ sim), `c` affiche/masque les gizmos des trois caméras dans la vue 3D,
`z` ouvre la loupe plein écran sur la vue mise en avant, `t` replie/déplie le panneau « Session agent (brut) »,
`p` replie/déplie le panneau « Perception », `x` ouvre le mode « Pipeline de traitement » plein écran.

Suivre la chaîne de bout en bout : le bandeau de statuts affiche la tomate en cours de mûrissement
(« tomate 3 : mûrit 62 % ») — une seule mûrit à la fois. Quand la perception la détecte, un bandeau
orange s'affiche 3,5 s au-dessus de la vue spectateur (« Tomate 3 mûre détectée → le serveur réveille
l'agent »), la trace garde la même ligne sur-lignée, et le schéma bloc allume les flèches une par une
(perception → serveur, puis serveur → agent), 1,2 s chacune, le bloc « Agent » restant allumé pendant
tout l'épisode.

Panneau « Session agent (brut) », sous la trace : le flux de la session Claude Code tel quel, façon
terminal (`init` avec la session et l'état du MCP, `text`, `tool_use`, `tool_result`, `result` avec le
coût, `stderr` en rouge), horodaté depuis le réveil, 300 dernières lignes. Il repart à vide à chaque
épisode. `t` le replie pour rendre la place à la trace.

Panneau des vues : la vue demandée en dernier par l'agent (`get_views` sur une seule caméra, ou `move_camera`)
est affichée en grand à droite, les deux autres en vignettes dessous ; un clic sur une vignette la met en avant.
Chaque vue garde sa dernière image et indique son âge (« il y a 3 s »).

Trace : chaque appel d'outil montre ses arguments et son résultat en JSON (les images y sont remplacées par
`<image 800×800>`). Les trois derniers appels sont dépliés, le bouton `−` / `+` replie ou déplie les autres ;
un appel sans résultat reste surligné avec un chrono qui tourne.

Replay : le panneau « Épisodes », à côté des contrôles, liste les journaux de `data/episodes/` ;
choisir un épisode et une vitesse puis « Rejouer » le repasse via un pont simulé, sans serveur ni agent.

Journaux et coût : chaque épisode est écrit dans `data/episodes/<episodeId>.json` (messages horodatés,
appels d'outils, résultat, coût). Coût observé pour un épisode complet mené par l'agent : environ 0,35 $.

## Perception — ce qui est vraiment du traitement d'image

La promesse de la démo est qu'un agent LLM décide et agit à partir de ce qu'il voit. Elle ne tient que si
l'on dit exactement où s'arrête le traitement d'image et où commence l'aide venue de la simulation.

**Ce qui sort du flux caméra, et de rien d'autre**

- La décision « cette tomate est mûre ». Le module de perception rend la vue `front` en 800×800 sans
  annotation, la réduit à 640×640 et la passe au détecteur actif. Aucun état de la simulation n'est lu :
  la garde de vérité terrain qui recoupait la détection avec `tomato.state === 'ripe'` a été retirée
  (issue #36). Une tomate que la simulation croit verte réveille l'agent si le détecteur la voit rouge,
  et une tomate que la simulation sait mûre ne réveille personne tant que le détecteur ne la voit pas.
- Le réveil lui-même : cinq images consécutives où la même tomate est vue mûre (`wakeGate`), puis
  `ripe_detected` avec le nom du détecteur et sa confiance. Le message envoyé à l'agent cite cette
  confiance, jamais la maturité connue de la simulation.
- Les contours des vues : niveaux de gris, égalisation locale CLAHE, Canny 50/150 (OpenCV.js), ou Sobel
  en repli si OpenCV ne se charge pas.

**Ce qui vient encore de la simulation, et qui est assumé**

- L'identifiant attribué à une boîte. L'association détection → tomate est purement géométrique — la
  tomate dont le centre 3D se projette le plus près du centre de la boîte, dans un rayon de 0,75 × son
  côté — mais elle utilise les positions connues de la simulation. Le détecteur dit « il y a un fruit
  mûr ici » ; c'est la simulation qui dit « c'est le fruit n° 3 ».
- Les annotations des vues envoyées à l'agent : repères et identifiants des tomates, ligne de tige, état
  des ciseaux et du panier, ligne de chute prévue. Rien de tout cela n'est extrait de l'image.
- La grille, les axes et l'échelle : calculés depuis la pose et le champ des caméras (calibration
  parfaite, ce qu'un robot réel obtiendrait par étalonnage).
- `get_status` renvoie aussi `state` et `ripeness` de chaque fruit : un agent qui les interroge lit la
  vérité terrain. Le réveil, lui, ne passe plus par là.

**Voir ce que voit le détecteur**

- `p` : panneau « Perception » dans la colonne de trace — l'image telle que le détecteur la reçoit (pas
  la vue annotée), ses boîtes avec classe et confiance, le nom du détecteur réellement actif, le temps de
  la dernière inférence, l'avancement de la porte (« 3/5 frames consécutives ») et l'état
  « modèle chargé » / « mode dégradé HSV ».
- `x` : mode « Pipeline de traitement » plein écran (Échap ou `x` pour fermer, boutons `top` / `front` /
  `side` pour changer de caméra). Dix tuiles, dans l'ordre du traitement, chacune montrant le tampon
  intermédiaire réel produit par le code de production et étiquetée par sa provenance :

  | # | Étape | Provenance |
  |---|---|---|
  | 1 | image caméra brute, 800×800 | caméra |
  | 2 | prétraitement CLAHE (gris égalisé) | OpenCV |
  | 3 | contours Canny 50/150 sur le rendu assombri à 35 % | OpenCV |
  | 4 | détection de maturité : boîtes, classe, confiance, temps d'inférence | modèle YOLOv8n ONNX, ou seuillage HSV |
  | 5 | association boîte → identifiant par projection | logique |
  | 6 | grille, axes et échelle | calibration caméra |
  | 7 | ciseaux et panier | état robot |
  | 8 | repères de tomates et ligne de tige | simulation |
  | 9 | ligne de chute prévue | géométrie (verticale) |
  | 10 | vue finale envoyée à l'agent | sortie |

**Quel détecteur tourne ?** Le bandeau haut et la pastille de perception le nomment en entier :
« YOLOv8n ONNX 640 » quand le modèle est chargé et a produit la dernière détection, « seuillage HSV 640 »
sinon. Par défaut c'est le modèle : un YOLOv8n affiné sur 400 rendus de la simulation, livré avec le
dépôt (12,3 Mo), qui atteint **1,000 de rappel et 0,963 de précision** sur les tomates mûres d'un jeu de
contrôle de 60 plants jamais vus, contre 0,816 / 0,743 pour le seuillage HSV.

L'inférence tourne dans un Web Worker, en wasm SIMD multithread : la page est servie *cross-origin
isolated* (`Cross-Origin-Opener-Policy` / `Cross-Origin-Embedder-Policy` dans `vite.config.ts`, et
`Cross-Origin-Resource-Policy` côté serveur MCP), sans quoi onnxruntime retombe sur un seul thread.
Résultat : 0,24 s par image au repos (0,5–0,8 s pendant que la scène tourne) et **2,5 à 6 s entre « la
tomate est mûre » et « détectée »** selon la charge, contre 10,8 s avant ce travail — mesuré sous rendu
logiciel, où la capture de la vue coûte autant que l'inférence. Chiffres complets, jeux, licences,
limites et reproduction dans [`docs/perception-model.md`](docs/perception-model.md).

## Tournage

- Résolution recommandée : 1920×1080 (redimensionner la fenêtre avant d'enregistrer).
- `v` : mode « ce que voit l'agent » (vues caméra agrandies à 70 % de l'écran).
- `h` : masque les contrôles pour un cadrage propre.
- `t` : replie le panneau « Session agent (brut) » ; le laisser ouvert pour montrer le travail de
  l'agent en direct, le replier pour donner toute la hauteur à la trace.
- `b` : ouvre le schéma bloc en bandeau bas, utile pour montrer le flux agent ↔ serveur ↔ sim.
- `c` : affiche les gizmos des trois caméras (masqués par défaut), utile pour expliquer d'où viennent les vues.
- `j` : incrustation « caméra outil » dans le coin bas droit de la vue spectateur — une caméra montée
  sur les ciseaux, à 30 cm en retrait et **sous** le plan des lames, qui suit leur pose et montre en
  gros l'ouverture, la coupe et le pédoncule. Elle s'allume toute seule dès que les ciseaux quittent
  leur pose de repos et s'éteint deux secondes après l'atterrissage du fruit ; `j` force l'état
  inverse. Masquer les contrôles (`h`) avant de filmer : sinon leur panneau recouvre l'incrustation.
- `k` : cadrage de la vue spectateur — « large » (plant, panier et bras entiers, cadrage par défaut) ou
  « coupe » (rapproché sur la zone de coupe, socle du bras hors champ), transition de 0,8 s. Les deux
  regardent la scène de face et de la droite du plant pour que l'avant-bras et les lames restent en
  travers du cadre pendant l'approche et la coupe (issue #42) ; leurs valeurs sont dans
  `packages/sim/src/three/spectatorFraming.ts`.
- `z` : loupe plein écran sur la vue mise en avant (ou clic sur la grande vue) — molette pour zoomer de ×1 à ×4
  autour du curseur, glisser pour se déplacer, boutons `top` / `front` / `side` pour changer de caméra, Échap pour fermer.
- `p` : panneau « Perception » — l'image d'entrée du détecteur et ses boîtes (voir la section Perception).
- `x` : mode « Pipeline de traitement » plein écran — les dix étapes du traitement et leur provenance.
  Depuis la loupe, `x` ferme la loupe avant d'ouvrir le pipeline.
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
- Panneau « Épisodes » : « serveur injoignable (Failed to fetch) » alors que le serveur répond dans un
  terminal ; c'était le CORS manquant sur `/health` et `/episodes` (issue #27, corrigé). Si le message
  revient, vérifier que `VITE_TOMATO_API_URL` pointe le bon port et que la réponse porte bien
  `Access-Control-Allow-Origin: *` (`curl -i http://localhost:7331/episodes`).
- `simConnected:false` dans `GET /health`, ou vue spectateur vide : la page http://localhost:5173 n'est
  pas ouverte ou n'a pas encore établi le WebSocket ; ouvrir ou recharger la page.
- L'agent ne se réveille jamais : vérifier `TOMATO_AGENT` (doit être `on` ou absent), que Claude Code CLI
  est connecté, et la ligne « prêt » du log serveur (elle indique `agent on/off`, le modèle et l'URL de
  réveil manuel). Avec `TOMATO_AGENT=off`, c'est normal : `npm run wake` ouvre bien l'épisode et émet
  `agent_wake`, mais aucune requête n'est envoyée au SDK — c'est à toi de piloter le robot par les outils MCP.
- `npm run wake` répond « fetch failed » : le serveur n'est pas démarré, ou son `TOMATO_WAKE_PORT` diffère
  de celui du réveil. La trace en direct de l'épisode demande en plus le même `TOMATO_WS_PORT` que le serveur
  (sans elle, le réveil part quand même et la commande le signale).
- Le dashboard affiche « mode dégradé HSV » : le modèle `packages/sim/public/models/tomato-ripe.onnx`
  (livré avec le dépôt, 12,3 Mo) n'a pas été chargé — fichier absent après un `git clone` partiel, ou
  worker refusé par le navigateur. La démo fonctionne quand même : la perception retombe sur le
  seuillage HSV, et le bandeau le dit. Pour régénérer le modèle : `python scripts/export-yolo.py` puis
  `python scripts/perception/finetune.py --install` (dépendances et licence en en-tête des scripts).
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
| `python scripts/export-yolo.py` | exporte le détecteur YOLOv8 ripe/unripe en ONNX dans `packages/sim/public/models/` |
| `npx tsx scripts/perception/generate-dataset.ts` | rend un jeu étiqueté (vues caméra brutes + boîtes de vérité terrain) |
| `python scripts/perception/evaluate.py --detector onnx` | précision, rappel et AP50 du détecteur sur ce jeu (`--detector hsv` pour le repli) |
| `python scripts/perception/finetune.py` | affine YOLOv8n sur les rendus de la sim et réexporte l'ONNX |
| `npx tsx scripts/perception/measure-latency.ts` | temps d'inférence et délai « mûre → détectée » |
| `npx tsx scripts/perception/verify-live.ts` | vérifie sur la vraie page que le réveil vient bien du modèle |
| `npm run lint` / `npm run typecheck` / `npm test` / `npm run build` | les quatre gates, obligatoires avant toute PR |

## Structure

    packages/shared            contrats : types, schémas zod des outils MCP, machine à états, monde par défaut
    packages/sim               page navigateur (Three.js + Rapier, React)
      src/plant, robot, cameras   plant, bras à ciseaux, panier, trois caméras
      src/perception              détection de maturité (modèle ONNX dans un worker, repli HSV), contours
      src/dev                     outils de développement : jeu d'évaluation rendu par la sim (mode dev seulement)
      src/bridge                  pont WebSocket vers le serveur (état, actions, vues)
      src/dashboard               dashboard React : bandeau, trace, replay, schéma bloc, contrôles
    packages/server            Node
      src/mcp                     serveur MCP streamable HTTP (outils du robot)
      src/hub                     hub WebSocket (sim et dashboards)
      src/agent                   runner d'agent Claude, réveil, serveur de réveil manuel
      src/episodes                journal des épisodes (`data/episodes/`)
    scripts/perception         jeu d'évaluation rendu par la sim, évaluation et fine-tuning du détecteur
    scripts/video              enregistrement et montage de la vidéo de démo
    docs/                      spec, plans, STATUS.md, perception-model.md
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
