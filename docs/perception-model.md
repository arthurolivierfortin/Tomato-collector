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
| Fichier livré | — | `packages/sim/public/models/tomato-ripe.onnx`, 12,3 Mo |

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

Voir « Décision » ci-dessous.

## Décision

_Complété après le fine-tuning (voir la section précédente)._

## Reproduire

    py -3 -m venv .venv && .venv/Scripts/python -m pip install ultralytics onnx onnxslim scipy
    .venv/Scripts/python scripts/export-yolo.py
    npm run dev:sim                       # ou: npx vite --port 5319 --strictPort (dans packages/sim)
    npx tsx scripts/perception/generate-dataset.ts --count 100 --seed 36  --out data/perception/eval
    npx tsx scripts/perception/generate-dataset.ts --count 400 --seed 2607 --out data/perception/train
    .venv/Scripts/python scripts/perception/evaluate.py --detector onnx
    .venv/Scripts/python scripts/perception/finetune.py --epochs 40 --install
