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
| Fichier livré | — | `packages/sim/public/models/tomato-ripe.onnx`, 12,3 Mo, versionné |
| Où il tourne | fil principal (≈ 30 ms) | Web Worker (`yoloWorker.ts`) |

En production, le module de perception essaie YOLO d'abord et retombe sur HSV si le modèle est absent,
en erreur, ou si aucune boîte `ripe` n'atteint 0,40 de score (`YOLO_ACCEPT_SCORE_MIN`).

## Jeu d'évaluation

Rendu par la simulation elle-même, avec des étiquettes calculées à la génération par projection des
tomates (jamais par un modèle) : `npx tsx scripts/perception/generate-dataset.ts`.

- Vues caméra **brutes** 800×800 — exactement ce que reçoit le détecteur, sans contours ni annotations.
- Un plant tiré au hasard par image (`new_plant`), sim accélérée ×10 pendant 200 à 700 ms pour attraper
  des fruits en cours de mûrissement, puis 0 à 4 fruits mûris d'un coup : le mélange rouge / orange /
  vert change à chaque prise.
- Caméra `front` par défaut : c'est la seule sur laquelle le détecteur tourne en production (spec 4.4).
  `--camera all` alterne les trois.
- Étiquettes : un fruit sphérique se projette en orthographique sur un carré de 2 r. Ne sont gardés que
  les fruits attachés, visibles à plus de 25 % (mesuré par la passe d'identifiants de `renderViews`,
  donc occultation réelle) et d'au moins 8 px de côté. `turning` compte comme `unripe`, les deux classes
  du modèle étant ripe/unripe.
- Jeu d'évaluation : **100 images, 188 boîtes `ripe`, 354 boîtes `unripe`** (graine 36).
- Jeu d'entraînement du fine-tuning : 400 images (graine 2607), disjoint du précédent.

Les jeux sont dans `data/perception/` (ignoré par git) et se régénèrent à l'identique depuis leur graine.

## Mesures

`python scripts/perception/evaluate.py --data data/perception/eval --detector <onnx|hsv>` — appariement
à IoU ≥ 0,5, seuil de confiance 0,25 sauf mention contraire, AP50 par interpolation tous points.

### Modèle Hugging Face tel quel (aucun entraînement sur la sim)

| Classe | vérité | prédictions | VP | FP | précision | rappel | F1 | AP50 |
|---|---|---|---|---|---|---|---|---|
| `ripe` | 188 | 138 | 136 | 2 | **0,986** | **0,723** | 0,834 | 0,864 |
| `unripe` | 354 | 122 | 120 | 2 | 0,984 | 0,339 | 0,504 | 0,560 |

mAP50 = 0,712. À seuil 0,10 : `ripe` précision 0,929, rappel 0,830.

### Seuillage HSV (le repli)

| Classe | vérité | prédictions | VP | FP | précision | rappel | F1 | AP50 |
|---|---|---|---|---|---|---|---|---|
| `ripe` | 188 | 201 | 140 | 61 | 0,697 | 0,745 | 0,720 | 0,630 |
| `unripe` | 354 | 0 | 0 | 0 | — | 0,000 | — | 0,000 |

HSV atteint un rappel comparable sur `ripe` mais avec 61 fausses boîtes contre 2 : le masque rouge
accroche aussi le panier jaune-orangé, les reflets et les fruits « turning ». Il ne distingue pas non
plus les fruits verts.

### YOLOv8n affiné sur 400 rendus de la simulation

`python scripts/perception/finetune.py --epochs 40 --batch 8 --device 0` — 40 epochs, 400 images
(graine 2607), imgsz 640, batch 8, 5 min 42 s sur RTX A1000 6 Go. Poids de départ : le `best.pt`
Hugging Face, pas un entraînement à partir de zéro.

Sur le jeu d'évaluation (100 images) — **qui a servi de `val` pendant l'entraînement**, donc à lire avec
la réserve d'usage :

| Classe | vérité | prédictions | VP | FP | précision | rappel | F1 | AP50 |
|---|---|---|---|---|---|---|---|---|
| `ripe` | 188 | 190 | 184 | 6 | 0,968 | 0,979 | 0,974 | 0,979 |
| `unripe` | 354 | 354 | 347 | 7 | 0,980 | 0,980 | 0,980 | 0,983 |

Sur un jeu **de contrôle jamais vu** (60 images, graine 999, ni entraînement ni validation) :

| Détecteur | Classe | vérité | VP | FP | précision | rappel | AP50 |
|---|---|---|---|---|---|---|---|
| YOLOv8n affiné | `ripe` | 102 | 102 | 3 | **0,971** | **1,000** | **1,000** |
| YOLOv8n affiné | `unripe` | 228 | 224 | 5 | 0,978 | 0,983 | 0,987 |
| Seuillage HSV | `ripe` | 102 | 84 | 25 | 0,771 | 0,824 | 0,758 |
| Seuillage HSV | `unripe` | 228 | 0 | 0 | — | 0,000 | 0,000 |

mAP50 du modèle affiné sur le jeu de contrôle : 0,993.

## Décision

**Le modèle affiné devient le détecteur par défaut.** Le critère de l'issue (rappel `ripe` ≥ 0,9 avec
peu de faux positifs) est franchi largement sur un jeu jamais vu : rappel 1,000, précision 0,971
(3 fausses boîtes sur 60 images). Le modèle reconnaît aussi les fruits verts, ce que HSV ne fait pas du
tout, et divise par huit les fausses détections `ripe`.

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

### Coût : l'inférence est passée dans un worker

Mesuré au chargement initial, l'inférence wasm prend **environ 350 ms par image sur le fil principal**,
et gelait la scène Three.js une demi-seconde à chaque tick (le rythme de rendu tombait de 60 à ~25
images/s, avec des blocages de 350 à 650 ms). L'inférence tourne donc maintenant dans un Web Worker
(`packages/sim/src/perception/yoloWorker.ts`) : la frame RGBA part en transfert, pas en copie, et le fil
principal reste à 60 images/s entre deux frames.

Sous rendu logiciel (SwiftShader, environnement de test et de mesure), le worker se dispute les cœurs
avec le rastériseur et la latence bout en bout monte à ~0,9–1,0 s par image : c'est ce que le panneau
affiche en « inférence ». Le réveil demande cinq détections consécutives, donc environ 5 s dans ces
conditions, contre ~2,5 s avec HSV. Sur une machine avec GPU, le rendu ne mange plus les cœurs et la
latence redescend vers la mesure brute.

## Limites connues

- Le modèle est affiné sur les rendus de **cette** simulation : il ne dit rien de ses performances sur
  de vraies photos de serre. La démonstration porte sur la chaîne (image → décision), pas sur le modèle.
- Les étiquettes du jeu viennent de la vérité terrain de la simulation. Elles sont donc parfaites, ce
  qui flatte les chiffres par rapport à un jeu annoté à la main.
- Le jeu d'évaluation a servi de `val` pendant l'entraînement ; seuls les chiffres du jeu de contrôle
  (60 images, graine 999) sont à l'abri de ce biais.
- `turning` (fruit orange) est étiqueté `unripe` : la frontière entre les deux classes est celle de la
  simulation (`ripeness ≥ 0,9`), pas une frontière apprise.

## Reproduire

    py -3 -m venv .venv && .venv/Scripts/python -m pip install ultralytics onnx onnxslim scipy
    .venv/Scripts/python scripts/export-yolo.py
    npm run dev:sim                       # ou: npx vite --port 5319 --strictPort (dans packages/sim)
    npx tsx scripts/perception/generate-dataset.ts --count 100 --seed 36  --out data/perception/eval
    npx tsx scripts/perception/generate-dataset.ts --count 400 --seed 2607 --out data/perception/train
    .venv/Scripts/python scripts/perception/evaluate.py --detector onnx
    .venv/Scripts/python scripts/perception/finetune.py --epochs 40 --install
