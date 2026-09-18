# Détecteur de maturité — ce qui a été essayé et mesuré

Issue #36. Objectif : que la décision « tomate mûre » sorte d'un traitement du flux caméra, et savoir
lequel des deux détecteurs disponibles mérite d'être celui par défaut.

## Les deux détecteurs

| | Seuillage HSV | YOLOv8n ONNX |
|---|---|---|
| Code | `packages/sim/src/perception/hsvDetector.ts` | `packages/sim/src/perception/yoloDetector.ts` |
| Principe | masque rouge (teinte < 10 ou > 170, S > 100, V > 80), ouverture 3×3, composantes connexes, aire ≥ 80 px | YOLOv8n 3,0 M paramètres, entrée 640×640 letterbox, onnxruntime-web (wasm, 1 thread) |
| Classes | `ripe` seulement | `unripe`, `ripe` |
| Poids | — | `best.pt` du Space Hugging Face `iamsuman/ripe-and-unripe-tomatoes-detection` (MIT), exporté par `scripts/export-yolo.py` |
| Licences | — | poids de départ MIT, **mais l'affinage et l'export passent par Ultralytics, sous AGPL-3.0** (voir « Licences » en bas) |
| Fichier livré | — | `packages/sim/public/models/tomato-ripe.onnx`, 12,3 Mo, versionné |
| Où il tourne | fil principal (≈ 30 ms) | Web Worker (`yoloWorker.ts`) |

En production, le module de perception essaie YOLO d'abord et retombe sur HSV si le modèle est absent,
en erreur, ou si aucune boîte `ripe` n'atteint 0,40 de score (`YOLO_ACCEPT_SCORE_MIN`).

## Jeu d'évaluation

Rendu par la simulation elle-même, avec des étiquettes calculées à la génération par projection des
tomates (jamais par un modèle) : `npx tsx scripts/perception/generate-dataset.ts`.

- Vues caméra **brutes** 800×800 — exactement ce que reçoit le détecteur, sans contours ni annotations.
- Un plant par image, régénéré avec une **graine explicite** propre à la prise :
  `plantSeed(graineDuJeu, index) = graineDuJeu × 100 000 + index + 1`. Deux jeux de graines
  différentes occupent donc des plages disjointes et ne peuvent pas partager un seul plant.
  *(Première version de ce travail : `new_plant` était appelé sans graine, donc tous les jeux
  rejouaient la même suite de plants et le « jeu de contrôle » ne contrôlait rien — 51 images sur 60
  avaient le même nombre de fruits que l'image de même rang du jeu d'entraînement. Les chiffres
  ci-dessous sont ceux d'après correction, sur des jeux réellement disjoints.)*
- Sim accélérée ×10 pendant 200 à 700 ms pour attraper des fruits en cours de mûrissement, puis 0 à 4
  fruits mûris d'un coup : le mélange rouge / orange / vert change à chaque prise.
- Caméra `front` par défaut : c'est la seule sur laquelle le détecteur tourne en production (spec 4.4).
  `--camera all` alterne les trois.
- Étiquettes : un fruit sphérique se projette en orthographique sur un carré de 2 r. Ne sont gardés que
  les fruits attachés, visibles à plus de 25 % (mesuré par la passe d'identifiants de `renderViews`,
  donc occultation réelle) et d'au moins 8 px de côté. `turning` compte comme `unripe`, les deux classes
  du modèle étant ripe/unripe.
Trois jeux, **560 plants tous différents** (graines vérifiées disjointes par test unitaire) :

| Jeu | Graine | Images | Boîtes `ripe` | Boîtes `unripe` | Rôle |
|---|---|---|---|---|---|
| `eval` | 36 | 100 | 189 | 355 | `val` pendant le fine-tuning |
| `train` | 2607 | 400 | 742 | 1348 | entraînement |
| `holdout` | 999 | 60 | 103 | 230 | **contrôle, jamais vu** |

Les jeux sont dans `data/perception/` (ignoré par git) et se régénèrent à l'identique depuis leur graine.

## Mesures

`python scripts/perception/evaluate.py --data data/perception/eval --detector <onnx|hsv>` — appariement
à IoU ≥ 0,5, seuil de confiance 0,25 sauf mention contraire, AP50 par interpolation tous points.

### Sur le jeu de contrôle (60 images, jamais vu à l'entraînement ni en validation)

C'est le seul tableau sans biais ; c'est sur lui que la décision se prend.

| Détecteur | Classe | vérité | VP | FP | précision | rappel | AP50 |
|---|---|---|---|---|---|---|---|
| **YOLOv8n affiné** | `ripe` | 103 | 103 | 4 | **0,963** | **1,000** | **1,000** |
| **YOLOv8n affiné** | `unripe` | 230 | 224 | 2 | 0,991 | 0,974 | 0,978 |
| YOLOv8n Hugging Face tel quel | `ripe` | 103 | 76 | 4 | 0,950 | 0,738 | 0,871 |
| YOLOv8n Hugging Face tel quel | `unripe` | 230 | 77 | 2 | 0,975 | 0,335 | 0,550 |
| Seuillage HSV | `ripe` | 103 | 84 | 29 | 0,743 | 0,816 | 0,712 |
| Seuillage HSV | `unripe` | 230 | 0 | 0 | — | 0,000 | 0,000 |

mAP50 : **0,989** (affiné), 0,711 (Hugging Face tel quel), 0,356 (HSV).

### Sur le jeu d'évaluation (100 images), qui a servi de `val` pendant l'entraînement

À lire avec la réserve d'usage — les poids retenus sont ceux qui maximisent cette validation.

| Détecteur | Classe | vérité | VP | FP | précision | rappel | AP50 |
|---|---|---|---|---|---|---|---|
| YOLOv8n affiné | `ripe` | 189 | 186 | 4 | 0,979 | 0,984 | 0,994 |
| YOLOv8n affiné | `unripe` | 355 | 347 | 2 | 0,994 | 0,978 | 0,986 |
| Seuillage HSV | `ripe` | 189 | 137 | 62 | 0,688 | 0,725 | 0,642 |

Le seuillage atteint un rappel `ripe` du même ordre que le modèle Hugging Face brut, mais avec
**29 fausses boîtes contre 4** sur le contrôle : le masque rouge accroche le panier jaune-orangé, les
reflets et les fruits « turning ». Il ne voit pas non plus les fruits verts, donc il ne peut pas dire
qu'une tomate n'est *pas* mûre.

### Entraînement

`python scripts/perception/finetune.py --epochs 40 --batch 8 --device 0 --install` — 40 epochs,
400 images, imgsz 640, batch 8, **4 min 55 s** sur RTX A1000 6 Go. Poids de départ : le `best.pt`
Hugging Face, pas un entraînement à partir de zéro.

## Décision

**Le modèle affiné devient le détecteur par défaut.** Le critère de l'issue (rappel `ripe` ≥ 0,9 avec
peu de faux positifs) est franchi sur le jeu de contrôle : rappel 1,000, précision 0,963 (4 fausses
boîtes sur 60 images, 333 fruits). Le modèle reconnaît aussi les fruits verts, ce que HSV ne fait pas
du tout, et divise par sept les fausses détections `ripe`.

`packages/sim/public/models/tomato-ripe.onnx` (12,3 Mo, sous la limite de 15 Mo) est **livré avec le
dépôt** — exception explicite dans `packages/sim/public/models/.gitignore`, pas de Git LFS — pour que
`npm run demo` détecte avec le modèle sans passer par une étape Python. Le repli HSV reste câblé : si le
fichier manque, si onnxruntime échoue, ou si aucune boîte `ripe` n'atteint 0,40, la perception continue
avec le seuillage et le dashboard le dit (« mode dégradé HSV »).

### Vérification en vrai

`npx tsx scripts/perception/verify-live.ts --port 5319`, page connectée à un serveur lancé en
`TOMATO_AGENT=off` : le modèle se charge, la tomate mûrie est détectée `ripe 0,97`, les fruits verts
sortent en `unripe 0,95`–`0,97`, la porte atteint 5/5 et `ripe_detected` part avec
`detector: "yolo", confidence: 0,969`. Le bandeau et le panneau affichent « YOLOv8n ONNX 640 ».
Capture et rapport : `data/shots/model-live.png` et `model-live.json`.

### Latence : ce qu'il a fallu pour tenir le rythme de la démo

« Tomate mûre → détectée » est le moment clé de la vidéo. La première version était inutilisable :
10,8 s. Trois corrections, mesurées par `npx tsx scripts/perception/measure-latency.ts --port 5319`
(même machine, même rendu logiciel SwiftShader, quatre réveils par mesure) :

| | Inférence par image | Mûre → détectée (médiane) |
|---|---|---|
| Départ : inférence sur le fil principal | ~350 ms, mais la scène gelait (60 → 25 images/s) | — |
| Worker, 1 thread wasm | 1,3–1,7 s | **10,8 s** |
| **Worker, wasm SIMD + 8 threads, COOP/COEP, période non gaspillée** | **0,24 s au repos, 0,5–0,8 s pendant le rendu** | **2,5 à 6,1 s selon les mesures, ~5 s typique** |

Quatre mesures de quatre réveils chacune ont donné 2,5 / 4,9 / 5,2 / 6,1 s. Chaque image traitée coûte
l'inférence (0,5–0,8 s mesurées pendant que la scène tourne) **plus** la capture de la vue caméra et sa
réduction à 640 px (0,1–0,4 s de plus par image, d'après l'écart entre le délai de porte mesuré et cinq
fois l'inférence). La porte étant à cinq images, cela fait 3 à 5 s. L'objectif de 4 s est donc atteint
dans les bonnes passes et frôlé dans les autres, **sous rendu logiciel** : c'est le rastériseur
SwiftShader de l'environnement de mesure qui paie la capture, pas le modèle. Avec un vrai GPU — le cas
du tournage — la capture redevient quasi gratuite et le budget retombe sur l'inférence seule.

Les trois corrections :

1. **Inférence dans un Web Worker** (`yoloWorker.ts`). Sur le fil principal, chaque tick gelait la scène
   Three.js une demi-seconde. La frame RGBA part en transfert, pas en copie ; le fil principal reste à
   60 images/s (mesuré : 116 images en 4 s avec le modèle, 123 sans — l'écart est dans le bruit).
2. **Threads wasm**. onnxruntime-web ne multithreade que si la page est `crossOriginIsolated` : le
   serveur Vite envoie donc `Cross-Origin-Opener-Policy: same-origin` et
   `Cross-Origin-Embedder-Policy: require-corp` (`packages/sim/vite.config.ts`, `server` et `preview`),
   et le serveur MCP répond `Cross-Origin-Resource-Policy: cross-origin` sur `/health` et `/episodes`
   pour rester lisible depuis la page isolée. Le nombre de threads est **plafonné à 8** : sur 24 cœurs
   logiques, 23 threads donnaient 2,7 s par image — deux fois pire que 4 — parce que le rastériseur
   occupe déjà la machine.
3. **Période non gaspillée**. Le module consommait sa période de 0,5 s même quand la détection
   précédente durait encore, donc un tick sur deux était perdu. La période n'est désormais consommée
   que lorsqu'une détection part vraiment : la porte compte des images traitées, jamais des tours
   sautés.

Le réveil demande cinq détections consécutives ; HSV, lui, tient le même parcours en ~3 s. Le modèle
coûte donc encore une à deux secondes de plus que le seuillage sur ce moment précis — c'est le prix
assumé d'une détection qui distingue vraiment le mûr du vert, avec sept fois moins de fausses boîtes.

## Limites connues

- Le modèle est affiné sur les rendus de **cette** simulation : il ne dit rien de ses performances sur
  de vraies photos de serre. La démonstration porte sur la chaîne (image → décision), pas sur le modèle.
- Les étiquettes du jeu viennent de la vérité terrain de la simulation. Elles sont donc parfaites, ce
  qui flatte les chiffres par rapport à un jeu annoté à la main.
- Le jeu d'évaluation a servi de `val` pendant l'entraînement ; seuls les chiffres du jeu de contrôle
  (60 images, graine 999) sont à l'abri de ce biais.
- L'isolation cross-origin (COOP/COEP) qui donne ses threads au détecteur interdit à la page de charger
  une ressource d'une autre origine sans en-tête CORP. Tout ce que la démo charge est servi par Vite ou
  par le serveur MCP (qui envoie CORP) ; ajouter une source externe demanderait de le vérifier.
- `turning` (fruit orange) est étiqueté `unripe` : la frontière entre les deux classes est celle de la
  simulation (`ripeness ≥ 0,9`), pas une frontière apprise.

## Licences

- Poids de départ : `best.pt` du Space Hugging Face `iamsuman/ripe-and-unripe-tomatoes-detection`,
  **licence MIT**.
- Outillage : l'entraînement (`yolo train`) et l'export ONNX passent par **Ultralytics, sous
  AGPL-3.0**. Le `.onnx` livré dans `packages/sim/public/models/` est donc un artefact produit par un
  outil AGPL-3.0 et porte les métadonnées Ultralytics ; c'est un usage de démonstration. Un usage qui
  ne peut pas vivre avec l'AGPL-3.0 doit soit prendre une licence commerciale Ultralytics, soit
  refaire l'affinage et l'export avec une autre chaîne d'outils, soit se contenter du repli HSV
  (qui n'emprunte rien : c'est du seuillage écrit dans ce dépôt).

## Reproduire

    py -3 -m venv .venv && .venv/Scripts/python -m pip install ultralytics onnx onnxslim scipy
    .venv/Scripts/python scripts/export-yolo.py
    npm run dev:sim                       # ou: npx vite --port 5319 --strictPort (dans packages/sim)
    npx tsx scripts/perception/generate-dataset.ts --count 100 --seed 36  --out data/perception/eval
    npx tsx scripts/perception/generate-dataset.ts --count 400 --seed 2607 --out data/perception/train
    npx tsx scripts/perception/generate-dataset.ts --count 60  --seed 999  --out data/perception/holdout
    .venv/Scripts/python scripts/perception/finetune.py --epochs 40 --device 0 --install
    .venv/Scripts/python scripts/perception/evaluate.py --data data/perception/holdout --detector onnx
    .venv/Scripts/python scripts/perception/evaluate.py --data data/perception/holdout --detector hsv
    npx tsx scripts/perception/measure-latency.ts --port 5319 --runs 4
    npx tsx scripts/perception/verify-live.ts --port 5319
