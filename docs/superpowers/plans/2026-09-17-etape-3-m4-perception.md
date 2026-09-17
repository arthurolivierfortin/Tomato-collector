# Étape 3 — M4 Perception : Canny + CLAHE, YOLO ONNX avec repli HSV, détecteur de réveil : plan d'implémentation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Donner à la sim une perception qui (1) remplace les contours Sobel des vues par Canny + CLAHE (OpenCV.js, WASM) dès qu'OpenCV est chargé, (2) détecte les tomates mûres à 2 Hz sim sur la vue `front` réduite à 640 px avec YOLOv8 ripe/unripe en ONNX (onnxruntime-web) et un repli HSV pur si le modèle manque ou n'est pas confiant, (3) associe les détections aux tomates du store, exige N vues consécutives (défaut 5) et un garde-fou vérité terrain désactivable, puis émet `ripe_detected` une seule fois par tomate jusqu'au prochain plant, et (4) expose `perceptionState()` et une pastille pour le dashboard.

**Architecture:** Un module `perceptionModule: SimModule` (nom `perception`) dans `packages/sim/src/perception/` (issue GitHub #4), ajouté à `MODULES` après `cameraModule`. Tout ce qui est calcul est pur et testé sous Vitest Node sur un type structurel `RgbaImage` (`ImageData` n'existe pas en Node) : conversion HSV et rééchantillonnage (`rgba.ts`), morphologie et composantes connexes (`morphology.ts`, `components.ts`), détecteur HSV (`hsvDetector.ts`), letterbox, décodage YOLOv8 et NMS (`yoloDecode.ts`), association détection ↔ tomate (`matching.ts`), porte de réveil (`wakeGate.ts`), pipeline Canny + CLAHE sur une interface `CvApi` structurelle (`cannyClahe.ts`) et l'orchestration du module avec dépendances injectées (`perceptionRuntime.ts`). Le navigateur n'apporte que trois choses : le chargement d'OpenCV.js par `import()` dynamique, le chargement du modèle ONNX avec onnxruntime-web (`yoloDetector.ts`) et le câblage réel (`perceptionModule.ts`, `PerceptionBadge.tsx`), couverts par Playwright (`tests/perception.spec.ts`) et le visual-checker. M4 touche `cameras/` en deux points seulement : `setEdgeFilter`/`getEdgeFilter` dans `renderViews.ts` et `renderCameraImage(scene, camId)` dans `cameraModule.ts`.

**Tech Stack:** TypeScript 5.9 strict (`exactOptionalPropertyTypes`, `noUncheckedIndexedAccess`), ESLint `consistent-type-imports`, Vitest 3 (Node, sans DOM), Vite 7, React 19, Playwright ; `@techstark/opencv-js` **4.11.0-release.1** (OpenCV.js 4.11, UMD + WASM inclus, 11,4 Mo, `import cvReadyPromise from '@techstark/opencv-js'; const cv = await cvReadyPromise`) ; `onnxruntime-web` **1.30.0** (`import * as ort from 'onnxruntime-web/wasm'`, backend `wasm`, fichier `ort-wasm-simd-threaded.wasm` 14,2 Mo servi par Vite via `import url from 'onnxruntime-web/ort-wasm-simd-threaded.wasm?url'`) ; modèle YOLOv8n ripe/unripe exporté en ONNX opset 12 par `scripts/export-yolo.py` (Python, `ultralytics`).

**Spec:** `docs/superpowers/specs/2026-09-17-tomato-harvest-demo-design.md` (sections 3, 4.4, 4.5, 8, 9, 10) ; contrat inter-modules : `docs/superpowers/plans/2026-09-17-etape-3-architecture.md` (section « Perception (M4) ») ; socle sim : `docs/superpowers/plans/2026-09-17-etape-2-architecture.md` ; checklist : `docs/superpowers/specs/2026-09-17-etape-3-m4-perception-checklist.md`.

## Global Constraints

- Un module = un dossier : tout le code M4 est dans `packages/sim/src/perception/`. Hors de ce dossier, M4 ne touche que : `packages/sim/src/cameras/renderViews.ts` (ajout de `setEdgeFilter`/`getEdgeFilter`) et `packages/sim/src/cameras/cameraModule.ts` (ajout de `renderCameraImage`), `packages/sim/package.json` (deux dépendances), `packages/sim/public/models/` (classes, `.gitignore`), `scripts/export-yolo.py` (script Python d'export, demandé par l'issue), `packages/sim/src/App.tsx` (ligne `MODULES` + deux imports + une ligne `<PerceptionBadge />` dans l'`aside`) et `packages/sim/tests/perception.spec.ts`. `packages/shared` est figé : ne pas y toucher.
- Prérequis : l'Étape 2 est mergée (M1 `plantModule`, M2 `robotModule`, M3 `cameraModule` dans `main`). Le builder part de `main` à jour. Les instructions sur `App.tsx` et `cameras/` sont écrites pour s'appliquer quel que soit le contenu exact de ces fichiers après les merges.
- Unités : centimètres et degrés côté monde ; pixels côté images. Toute erreur vers l'agent passe par `fail(...)`/`ok(...)` de `@tomato/shared`, jamais `throw` ; M4 n'a pas d'action et n'émet que l'événement `ripe_detected`. Pas de `any`. Fichiers < 200 lignes.
- Windows sans toolchain native : OpenCV.js et onnxruntime-web sont des paquets WASM purs, aucune dépendance native ajoutée. Le modèle ONNX est **optionnel** (spec section 10, coupe n° 1) : s'il manque, le module le journalise et fonctionne en HSV seul ; aucun gate ne dépend de sa présence.
- Vérifications faites par le rédacteur du plan sur les paquets installés et dans un navigateur Chromium headless avec un scratch de `packages/sim` (Vite 7.3.6 dev et build) :
  - `@techstark/opencv-js@4.11.0-release.1` : le default export est une **Promise** résolue vers `cv` (README « >= 4.11 ») ; en Vite dev l'`import()` dynamique fonctionne sans configuration (les `require('fs'|'path'|'crypto')` du wrapper Emscripten sont externalisés avec un avertissement, jamais exécutés dans le navigateur) ; `vite build` isole `opencv.js` dans un chunk propre de 11,3 Mo (avertissement de taille, pas d'erreur). À l'exécution : `cv.matFromImageData`, `new cv.Mat()`, `cv.cvtColor(src, dst, cv.COLOR_RGBA2GRAY)`, `new cv.CLAHE(clip, new cv.Size(8, 8))` + `clahe.apply(src, dst)`, `cv.Canny(src, dst, 50, 150, 3, false)` (sortie `CV_8UC1`, `.data` = `Uint8Array` de 0/255, `.rows`/`.cols`), `mat.delete()`, `cv.erode`/`cv.dilate`/`cv.getStructuringElement` existent. **`cv.createCLAHE` est déclaré dans les types mais n'existe pas à l'exécution** (`'createCLAHE' in cv === false`) : le plan utilise la classe `cv.CLAHE`, présente dans les types (`_hacks.d.ts`) et à l'exécution.
  - `onnxruntime-web@1.30.0` : `exports` du paquet vérifiés : `onnxruntime-web/wasm` → `dist/ort.wasm.bundle.min.mjs` (chargeur `.mjs` inclus, référence `ort-wasm-simd-threaded.wasm`), `onnxruntime-web/ort-wasm-simd-threaded.wasm` → `dist/ort-wasm-simd-threaded.wasm` (donc importable avec le suffixe Vite `?url`). L'import par défaut (`onnxruntime-web`) tire la variante **jsep** (WebGPU, `.wasm` de 28 Mo) : inutile ici. `ort.env.wasm.wasmPaths` accepte un préfixe ou un objet `{ wasm, mjs }` (`env.d.ts`, `WasmPrefixOrFilePaths`) ; **en Vite dev la forme préfixe échoue** (Vite refuse d'importer un `.mjs` de `public/` : erreur 500 « This file is in /public… ») tandis que la forme objet `{ wasm: url }` fonctionne (session créée en ≈ 420 ms). `numThreads = 1` évite la détection multi-thread (qui exige `crossOriginIsolated`, absent en Vite dev). `InferenceSession.create(Uint8Array, { executionProviders: ['wasm'] })`, `session.inputNames`/`outputNames`, `new ort.Tensor('float32', Float32Array, dims)`, `session.run(feeds)` → `{ [name]: Tensor }` avec `.data` (`Float32Array`) et `.dims` : signatures lues dans `onnxruntime-common/dist/esm/{inference-session,tensor}.d.ts` et exercées dans le navigateur (`inputNames ['images']`, `outputNames ['output0']`, `dims [1, 6, 8400]`, `run ≈ 330–390 ms` en un thread sous SwiftShader).
  - Modèle : le dépôt `iamsuman/ripe-and-unripe-tomatoes-detection` renvoie 401 anonymement, mais le **Space** du même nom est public (MIT, `gated: false`) et contient `best.pt` (6 247 395 octets, YOLOv8n `detect`, `names = {0: 'unripe', 1: 'ripe'}`), téléchargeable à `https://huggingface.co/spaces/iamsuman/ripe-and-unripe-tomatoes-detection/resolve/main/best.pt` (vérifié : 302 puis 200). Aucun `.onnx` prêt à l'emploi n'existe ; l'export `YOLO('best.pt').export(format='onnx', imgsz=640, opset=12)` a été exécuté (ultralytics 8.4.155, onnx 1.22.0) : `best.onnx` 12 266 535 octets, entrée `images [1, 3, 640, 640]`, sortie `output0 [1, 6, 8400]`, métadonnées `names` et `imgsz` embarquées mais non lisibles par onnxruntime-web, d'où le fichier `tomato-ripe.json`. Le `.onnx` (> 10 Mo) est ignoré par git.
  - Bout en bout : avec M1 + M3 assemblés dans le scratch, `ripen_next` puis 5 ticks à 2 Hz → `ripe_detected { tomatoId: 3, detector: 'yolo', confidence: 0.46 }` ; YOLO reconnaît la tomate rendue (boîte centrée à 1,5 px de la projection), HSV trouve les trois tomates mûres (pixel rendu (127, 22, 13) → H 2, S 229, V 127).
- **Point d'attention découvert en scratch (StrictMode)** : React StrictMode monte la scène deux fois ; les modules sont initialisés sur les deux scènes et la scène jetée peut finir son `init` en dernier. Un état de module global (par exemple `cams` de M3) peut alors pointer la scène morte : la capture M4 renvoyait une image figée. M4 est donc écrit pour être immunisé : `renderCameraImage(scene, camId)` est indexé par `SceneHandle` (`WeakMap`) et `captureFront(ctx)` utilise `ctx.scene` du runtime qui tourne réellement. Si, après merge, `renderViews` ou `move_camera` semblent inertes dans la page, c'est ce mécanisme côté M3 (`cams`, `renderViewsFn` globaux) qu'il faut regarder : le signaler dans `plan_deviations`, ne pas le corriger dans cette PR.
- Gates par PR : `npm run lint`, `npm run typecheck`, `npm test`, `npm run build`, plus `npm run shot` (module de rendu : `data/shots/view-front-canny.png`, `perception.png`, `perception.json`).
- Le builder travaille dans un worktree sur la branche `feat/4-m4-perception` (voir `.claude/agents/builder.md`).

---

## Structure de fichiers

```
packages/sim/src/perception/
  types.ts                 RgbaImage, Detection, RipeDetector, PerceptionState, DETECTOR_INPUT_PX          (pur)
  rgba.ts                  rgbToHsv (échelle OpenCV), makeRgba, resizeRgba (bilinéaire)                    (pur)
  rgba.test.ts
  morphology.ts            erode3, dilate3, open3 sur masque binaire                                        (pur)
  components.ts            labelComponents : composantes connexes 4-connexité, pile explicite              (pur)
  components.test.ts
  hsvDetector.ts           redMask, hsvDetector (masque rouge → ouverture → composantes → aire min)         (pur)
  hsvDetector.test.ts
  testImages.ts            discImage et couleurs de la palette pour les tests
  yoloDecode.ts            letterbox, unletterbox, labelFromName, parseModelMeta, decodeYolo, iou, nms     (pur)
  yoloDecode.test.ts
  matching.ts              matchDetections(detections, tomatoes, project)                                  (pur)
  matching.test.ts
  wakeGate.ts              createWakeGate(n)                                                               (pur)
  wakeGate.test.ts
  cannyClahe.ts            CvApi, edgesToWhiteRgba, cannyClaheRgba, createCannyClaheFilter, loadOpenCv     (pur sauf les deux dernières)
  cannyClahe.test.ts
  perceptionRuntime.ts     createPerceptionModule(deps) : 2 Hz sim, YOLO puis HSV, association, porte, événement   (pur, deps injectées)
  perceptionRuntime.test.ts
  yoloDetector.ts          loadYoloDetector : onnxruntime-web/wasm, modèle et classes depuis public/models  (navigateur)
  perceptionModule.ts      perceptionModule, perceptionState, subscribePerception, window.__tomatoPerception (navigateur)
  PerceptionBadge.tsx      pastille « contours / modèle / dernier tick »                                    (navigateur)
packages/sim/src/cameras/renderViews.ts    + setEdgeFilter, getEdgeFilter (le pipeline lit getEdgeFilter() à chaque rendu)
packages/sim/src/cameras/cameraModule.ts   + renderCameraImage(scene, camId), caméras indexées par scène
packages/sim/src/App.tsx                   MODULES = [..., cameraModule, perceptionModule], <PerceptionBadge />
packages/sim/package.json                  @techstark/opencv-js, onnxruntime-web
packages/sim/public/models/tomato-ripe.json, .gitignore   (tomato-ripe.onnx produit par le script, non versionné)
packages/sim/tests/perception.spec.ts      Playwright : Canny actif, pastille, réveil sur ripen_next, captures
scripts/export-yolo.py                     téléchargement de best.pt et export ONNX (une fois, optionnel)
docs/superpowers/specs/2026-09-17-etape-3-m4-perception-checklist.md
```

---

### Task 1: Dépendances, dossier des modèles et script d'export

**Files:**
- Modify: `packages/sim/package.json`
- Create: `packages/sim/public/models/tomato-ripe.json`, `packages/sim/public/models/.gitignore`, `scripts/export-yolo.py`

**Interfaces:**
- Produces : le fichier de classes `{ names: string[]; imgsz: number; opset: number; source: string }` lu par `loadYoloDetector` (Task 9) ; `tomato-ripe.onnx` optionnel au même endroit.

- [ ] **Step 1: Installer les deux dépendances (versions exactes vérifiées)**

Run (à la racine du repo) :
```bash
npm install -w @tomato/sim --save-exact @techstark/opencv-js@4.11.0-release.1 onnxruntime-web@1.30.0
```
Expected: `packages/sim/package.json` contient `"@techstark/opencv-js": "4.11.0-release.1"` et `"onnxruntime-web": "1.30.0"` dans `dependencies` ; `node_modules/@techstark/opencv-js/dist/opencv.js` (≈ 11,4 Mo) et `node_modules/onnxruntime-web/dist/ort-wasm-simd-threaded.wasm` (≈ 14,2 Mo) existent ; aucun script natif compilé.

- [ ] **Step 2: Écrire `packages/sim/public/models/tomato-ripe.json`**

```json
{
  "names": ["unripe", "ripe"],
  "imgsz": 640,
  "opset": 12,
  "source": "https://huggingface.co/spaces/iamsuman/ripe-and-unripe-tomatoes-detection/resolve/main/best.pt"
}
```

- [ ] **Step 3: Écrire `packages/sim/public/models/.gitignore`**

```
*.onnx
*.pt
work/
```

- [ ] **Step 4: Écrire `scripts/export-yolo.py`**

```python
"""Exporte le detecteur YOLOv8 ripe/unripe en ONNX pour onnxruntime-web (module M4, optionnel).

Source : best.pt du Space Hugging Face iamsuman/ripe-and-unripe-tomatoes-detection (licence MIT,
classes {0: 'unripe', 1: 'ripe'}, YOLOv8n, 3,0 M parametres). L'export Ultralytics ajoute ses
metadonnees (licence AGPL-3.0 pour le format exporte) : usage de demo uniquement.

Usage (une fois, Python >= 3.10, torch installe automatiquement par ultralytics) :
    pip install ultralytics onnx onnxslim
    python scripts/export-yolo.py

Sorties dans packages/sim/public/models/ :
    tomato-ripe.onnx  (~11,7 Mo, ignore par git)   entree images [1,3,640,640], sortie output0 [1,6,8400]
    tomato-ripe.json  (classes dans l'ordre des indices, imgsz, opset)
"""

import json
import shutil
import urllib.request
from pathlib import Path

SOURCE_URL = "https://huggingface.co/spaces/iamsuman/ripe-and-unripe-tomatoes-detection/resolve/main/best.pt"
ROOT = Path(__file__).resolve().parents[1]
MODELS_DIR = ROOT / "packages" / "sim" / "public" / "models"
WORK_DIR = MODELS_DIR / "work"
IMGSZ = 640
OPSET = 12


def main() -> None:
    WORK_DIR.mkdir(parents=True, exist_ok=True)
    weights = WORK_DIR / "best.pt"
    if not weights.exists():
        print("telechargement", SOURCE_URL)
        urllib.request.urlretrieve(SOURCE_URL, weights)
    from ultralytics import YOLO  # import tardif : le message d'erreur pip est plus clair que l'ImportError

    model = YOLO(str(weights))
    names = [str(model.names[i]) for i in sorted(model.names)]
    exported = Path(model.export(format="onnx", imgsz=IMGSZ, opset=OPSET))
    target = MODELS_DIR / "tomato-ripe.onnx"
    shutil.copyfile(exported, target)
    meta = {"names": names, "imgsz": IMGSZ, "opset": OPSET, "source": SOURCE_URL}
    (MODELS_DIR / "tomato-ripe.json").write_text(json.dumps(meta, indent=2) + "\n", encoding="utf-8")
    print("classes", names)
    print("ecrit", target, target.stat().st_size, "octets")


if __name__ == "__main__":
    main()
```

- [ ] **Step 5: Exporter le modèle si Python est disponible (optionnel, ne bloque rien)**

Run :
```bash
python -m py_compile scripts/export-yolo.py && pip install ultralytics onnx onnxslim && python scripts/export-yolo.py
```
Expected: `classes ['unripe', 'ripe']` puis `ecrit ...\packages\sim\public\models\tomato-ripe.onnx 12266535 octets` (≈ 11,7 Mo ; l'export affiche `output shape(s) (1, 6, 8400)`). `git status` ne montre pas le `.onnx` (ignoré). Si `pip install ultralytics` échoue (torch absent, Python < 3.10, pas de réseau), **ne pas insister** : la démo tourne en HSV seul et le dashboard le dit ; noter « YOLO non exporté » dans `plan_deviations`. Sur Windows, si pip échoue avec `WinError 206` (chemin trop long), utiliser un venv à chemin court (`python -m venv C:\tcv`).

- [ ] **Step 6: Commit**

```bash
git add packages/sim/package.json package-lock.json packages/sim/public/models/tomato-ripe.json packages/sim/public/models/.gitignore scripts/export-yolo.py
git commit -m "feat(perception): dépendances OpenCV.js et onnxruntime-web, classes du modèle, script d'export YOLO"
```

---

### Task 2: Types et pixels (`types.ts`, `rgba.ts`)

**Files:**
- Create: `packages/sim/src/perception/types.ts`, `packages/sim/src/perception/rgba.ts`, `packages/sim/src/perception/rgba.test.ts`

**Interfaces:**
- Consumes: `DetectorKind` de `@tomato/shared`.
- Produces:
  - `interface RgbaImage { readonly width: number; readonly height: number; readonly data: Uint8ClampedArray }` (structurel : `ImageData` s'y conforme)
  - `type DetectionLabel = 'ripe' | 'unripe'`, `interface Detection { bbox: readonly [number, number, number, number]; score: number; label: DetectionLabel }`
  - `type RipeDetector = (img: RgbaImage) => Detection[] | Promise<Detection[]>` (l'union est imposée par `InferenceSession.run(): Promise<…>` d'onnxruntime-web ; le contrat d'architecture ne mentionnait que la forme synchrone)
  - `interface PerceptionState { opencvReady: boolean; yoloReady: boolean; lastDetector: DetectorKind | null; lastDetections: Detection[] }`, `const DETECTOR_INPUT_PX = 640`
  - `type Hsv = readonly [number, number, number]`, `rgbToHsv(r, g, b): Hsv` (H 0..180, S et V 0..255, convention OpenCV 8 bits), `makeRgba(width, height, rgb?): RgbaImage`, `resizeRgba(img, width, height): RgbaImage`

- [ ] **Step 1: Écrire le test (échoue)**

`packages/sim/src/perception/rgba.test.ts` :

```ts
import { describe, expect, it } from 'vitest';
import { makeRgba, resizeRgba, rgbToHsv } from './rgba';

describe('rgbToHsv (échelle OpenCV : H 0..180, S et V 0..255)', () => {
  it('maps pure red, green and blue to hues 0, 60 and 120 with full saturation', () => {
    expect(rgbToHsv(255, 0, 0)).toEqual([0, 255, 255]);
    expect(rgbToHsv(0, 255, 0)).toEqual([60, 255, 255]);
    expect(rgbToHsv(0, 0, 255)).toEqual([120, 255, 255]);
  });

  it('gives grey a zero saturation and black a zero value', () => {
    expect(rgbToHsv(90, 90, 90)).toEqual([0, 0, 90]);
    expect(rgbToHsv(0, 0, 0)).toEqual([0, 0, 0]);
  });

  it('puts the ripe red #c8261b in the low red band and the unripe green far from it', () => {
    const [h, s, v] = rgbToHsv(200, 38, 27);
    expect(h).toBeLessThan(10);
    expect(s).toBeGreaterThan(100);
    expect(v).toBe(200);
    const [hg] = rgbToHsv(63, 154, 58);
    expect(hg).toBeGreaterThan(50);
    expect(hg).toBeLessThan(70);
  });

  it('wraps magenta-ish reds to the high band (H > 170)', () => {
    const [h] = rgbToHsv(255, 0, 40);
    expect(h).toBeGreaterThan(170);
  });
});

describe('resizeRgba', () => {
  it('keeps a uniform image uniform and opaque', () => {
    const out = resizeRgba(makeRgba(8, 8, [10, 20, 30]), 3, 5);
    expect(out.width).toBe(3);
    expect(out.height).toBe(5);
    for (let i = 0; i < 15; i++) expect(Array.from(out.data.subarray(i * 4, i * 4 + 4))).toEqual([10, 20, 30, 255]);
  });

  it('downsamples 800 → 640 with the expected buffer size and averages a hard edge', () => {
    const img = makeRgba(800, 800, [0, 0, 0]);
    for (let y = 0; y < 800; y++) for (let x = 400; x < 800; x++) img.data.set([255, 255, 255, 255], (y * 800 + x) * 4);
    const out = resizeRgba(img, 640, 640);
    expect(out.data.length).toBe(640 * 640 * 4);
    expect(out.data[(10 * 640 + 10) * 4]).toBe(0);
    expect(out.data[(10 * 640 + 630) * 4]).toBe(255);
  });

  it('returns the same object when the size already matches', () => {
    const img = makeRgba(4, 4);
    expect(resizeRgba(img, 4, 4)).toBe(img);
  });
});
```

- [ ] **Step 2: Vérifier l'échec**

Run: `npx vitest run packages/sim/src/perception/rgba.test.ts`
Expected: FAIL, module `./rgba` introuvable.

- [ ] **Step 3: Écrire `types.ts`**

```ts
import type { DetectorKind } from '@tomato/shared';

/** Image RGBA structurelle : `ImageData` du navigateur, ou tampon nu dans les tests Node. */
export interface RgbaImage {
  readonly width: number;
  readonly height: number;
  readonly data: Uint8ClampedArray;
}

export type DetectionLabel = 'ripe' | 'unripe';

/** Boîte [x, y, w, h] en pixels de l'image analysée ; score 0..1. */
export interface Detection {
  bbox: readonly [number, number, number, number];
  score: number;
  label: DetectionLabel;
}

/**
 * Un détecteur de tomates mûres. Synchrone (HSV) ou asynchrone (YOLO : `InferenceSession.run` de
 * onnxruntime-web renvoie une Promise), d'où l'union.
 */
export type RipeDetector = (img: RgbaImage) => Detection[] | Promise<Detection[]>;

/** État exposé au dashboard (`perceptionState()`). */
export interface PerceptionState {
  opencvReady: boolean;
  yoloReady: boolean;
  lastDetector: DetectorKind | null;
  lastDetections: Detection[];
}

/** Côté de l'image carrée fournie aux détecteurs (spec 4.4 : vue front réduite à 640 px). */
export const DETECTOR_INPUT_PX = 640;
```

- [ ] **Step 4: Écrire `rgba.ts`**

```ts
import type { RgbaImage } from './types';

/** Teinte 0..180, saturation 0..255, valeur 0..255 : convention OpenCV 8 bits. */
export type Hsv = readonly [number, number, number];

/** Conversion RGB (0..255) → HSV à l'échelle OpenCV (H sur 0..180, S et V sur 0..255), arrondie. */
export function rgbToHsv(r: number, g: number, b: number): Hsv {
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const delta = max - min;
  const s = max === 0 ? 0 : (255 * delta) / max;
  let hDeg = 0;
  if (delta > 0) {
    if (max === r) hDeg = (60 * (g - b)) / delta;
    else if (max === g) hDeg = 120 + (60 * (b - r)) / delta;
    else hDeg = 240 + (60 * (r - g)) / delta;
    if (hDeg < 0) hDeg += 360;
  }
  return [Math.round(hDeg / 2) % 180, Math.round(s), Math.round(max)];
}

/** Crée une image RGBA opaque de couleur uniforme. */
export function makeRgba(width: number, height: number, rgb: readonly [number, number, number] = [0, 0, 0]): RgbaImage {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let i = 0; i < width * height; i++) data.set([rgb[0], rgb[1], rgb[2], 255], i * 4);
  return { width, height, data };
}

/** Rééchantillonnage bilinéaire vers width × height ; l'alpha est forcé à 255. Renvoie l'image telle quelle si la taille est déjà bonne. */
export function resizeRgba(img: RgbaImage, width: number, height: number): RgbaImage {
  if (img.width === width && img.height === height) return img;
  const out = new Uint8ClampedArray(width * height * 4);
  const sx = img.width / width;
  const sy = img.height / height;
  const at = (x: number, y: number, c: number): number => img.data[(y * img.width + x) * 4 + c] ?? 0;
  for (let y = 0; y < height; y++) {
    const fy = Math.max(0, Math.min(img.height - 1, (y + 0.5) * sy - 0.5));
    const y0 = Math.floor(fy);
    const y1 = Math.min(img.height - 1, y0 + 1);
    const wy = fy - y0;
    for (let x = 0; x < width; x++) {
      const fx = Math.max(0, Math.min(img.width - 1, (x + 0.5) * sx - 0.5));
      const x0 = Math.floor(fx);
      const x1 = Math.min(img.width - 1, x0 + 1);
      const wx = fx - x0;
      const o = (y * width + x) * 4;
      for (let c = 0; c < 3; c++) {
        const top = at(x0, y0, c) * (1 - wx) + at(x1, y0, c) * wx;
        const bottom = at(x0, y1, c) * (1 - wx) + at(x1, y1, c) * wx;
        out[o + c] = Math.round(top * (1 - wy) + bottom * wy);
      }
      out[o + 3] = 255;
    }
  }
  return { width, height, data: out };
}
```

- [ ] **Step 5: Vérifier le succès**

Run: `npx vitest run packages/sim/src/perception/rgba.test.ts`
Expected: PASS, 7 tests.

- [ ] **Step 6: Commit**

```bash
git add packages/sim/src/perception/types.ts packages/sim/src/perception/rgba.ts packages/sim/src/perception/rgba.test.ts
git commit -m "feat(perception): types du module, conversion HSV à l'échelle OpenCV, rééchantillonnage bilinéaire"
```

---

### Task 3: Morphologie, composantes connexes et détecteur HSV

**Files:**
- Create: `packages/sim/src/perception/morphology.ts`, `packages/sim/src/perception/components.ts`, `packages/sim/src/perception/components.test.ts`, `packages/sim/src/perception/hsvDetector.ts`, `packages/sim/src/perception/testImages.ts`, `packages/sim/src/perception/hsvDetector.test.ts`

**Interfaces:**
- Produces:
  - `type Mask = Uint8Array`, `erode3(mask, width, height): Mask`, `dilate3(...)`, `open3(...)` (carré 3×3, hors image = 0)
  - `interface Component { minX; minY; maxX; maxY; area }`, `labelComponents(mask, width, height): Component[]` (4-connexité, pile explicite)
  - `const RED_HUE_LOW_MAX = 10`, `RED_HUE_HIGH_MIN = 170`, `RED_SAT_MIN = 100`, `RED_VAL_MIN = 80`, `MIN_BLOB_AREA_PX = 80` ; `redMask(img): Mask` ; `hsvDetector: RipeDetector` (score = aire / (w·h), label `ripe`, trié par aire décroissante)
  - `discImage(width, height, discs: Disc[]): RgbaImage`, `RIPE_RGB`, `TURNING_RGB`, `UNRIPE_RGB`, `BACKGROUND_RGB` (aide de test)

- [ ] **Step 1: Tests (échouent)**

`packages/sim/src/perception/components.test.ts` :

```ts
import { describe, expect, it } from 'vitest';
import { labelComponents } from './components';
import { dilate3, erode3, open3 } from './morphology';

/** Masque 8×6 : un carré 3×3 en (1..3, 1..3), un pixel isolé en (6, 1), un rectangle 2×1 en (5..6, 4). */
function sample(): Uint8Array {
  const m = new Uint8Array(8 * 6);
  for (let y = 1; y <= 3; y++) for (let x = 1; x <= 3; x++) m[y * 8 + x] = 1;
  m[1 * 8 + 6] = 1;
  m[4 * 8 + 5] = 1;
  m[4 * 8 + 6] = 1;
  return m;
}

describe('morphology 3×3', () => {
  it('erode3 keeps only the centre of a 3×3 square and removes isolated pixels', () => {
    const e = erode3(sample(), 8, 6);
    expect(Array.from(e).reduce((a, b) => a + b, 0)).toBe(1);
    expect(e[2 * 8 + 2]).toBe(1);
  });

  it('dilate3 grows a single pixel into a 3×3 square, clipped by the border', () => {
    const m = new Uint8Array(4 * 4);
    m[0] = 1;
    const d = dilate3(m, 4, 4);
    expect(Array.from(d)).toEqual([1, 1, 0, 0, 1, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]);
  });

  it('open3 restores the 3×3 square and drops the noise', () => {
    const o = open3(sample(), 8, 6);
    expect(Array.from(o).reduce((a, b) => a + b, 0)).toBe(9);
    expect(o[1 * 8 + 6]).toBe(0);
    expect(o[4 * 8 + 5]).toBe(0);
  });
});

describe('labelComponents', () => {
  it('finds the three 4-connected components with their boxes and areas, in scan order', () => {
    const comps = labelComponents(sample(), 8, 6);
    expect(comps).toEqual([
      { minX: 1, minY: 1, maxX: 3, maxY: 3, area: 9 },
      { minX: 6, minY: 1, maxX: 6, maxY: 1, area: 1 },
      { minX: 5, minY: 4, maxX: 6, maxY: 4, area: 2 },
    ]);
  });

  it('does not join diagonal neighbours', () => {
    const m = new Uint8Array([1, 0, 0, 1]);
    expect(labelComponents(m, 2, 2)).toHaveLength(2);
  });

  it('handles a fully set image as one component without recursion', () => {
    const m = new Uint8Array(200 * 200).fill(1);
    const comps = labelComponents(m, 200, 200);
    expect(comps).toHaveLength(1);
    expect(comps[0]?.area).toBe(40000);
  });
});
```

`packages/sim/src/perception/hsvDetector.test.ts` :

```ts
import { describe, expect, it } from 'vitest';
import { hsvDetector, redMask } from './hsvDetector';
import { RIPE_RGB, TURNING_RGB, UNRIPE_RGB, discImage } from './testImages';

describe('redMask', () => {
  it('selects the ripe red, rejects the unripe green, the turning orange and the background', () => {
    const img = discImage(8, 1, [
      { cx: 1, cy: 0, r: 0.5, rgb: RIPE_RGB },
      { cx: 3, cy: 0, r: 0.5, rgb: UNRIPE_RGB },
      { cx: 5, cy: 0, r: 0.5, rgb: TURNING_RGB },
    ]);
    expect(Array.from(redMask(img))).toEqual([0, 1, 0, 0, 0, 0, 0, 0]);
  });

  it('rejects a dark red shadow (V ≤ 80) and a washed-out pink (S ≤ 100)', () => {
    const img = discImage(2, 1, [
      { cx: 0, cy: 0, r: 0.5, rgb: [70, 10, 8] },
      { cx: 1, cy: 0, r: 0.5, rgb: [230, 170, 170] },
    ]);
    expect(Array.from(redMask(img))).toEqual([0, 0]);
  });
});

describe('hsvDetector', () => {
  const img = discImage(64, 64, [
    { cx: 20, cy: 30, r: 10, rgb: RIPE_RGB },
    { cx: 46, cy: 18, r: 8, rgb: UNRIPE_RGB },
    { cx: 5, cy: 5, r: 0.5, rgb: RIPE_RGB },
    { cx: 60, cy: 60, r: 1, rgb: RIPE_RGB },
  ]);

  it('returns one ripe detection around the red disc, with a disc-like fill ratio', async () => {
    const dets = await hsvDetector(img);
    expect(dets).toHaveLength(1);
    const d = dets[0]!;
    expect(d.label).toBe('ripe');
    expect(d.bbox[0]).toBeGreaterThanOrEqual(9);
    expect(d.bbox[0]).toBeLessThanOrEqual(11);
    expect(d.bbox[1]).toBeGreaterThanOrEqual(19);
    expect(d.bbox[1]).toBeLessThanOrEqual(21);
    expect(d.bbox[2]).toBeGreaterThanOrEqual(19);
    expect(d.bbox[2]).toBeLessThanOrEqual(22);
    expect(d.score).toBeGreaterThan(0.7);
    expect(d.score).toBeLessThan(0.9);
  });

  it('ignores an image without red', async () => {
    expect(await hsvDetector(discImage(32, 32, [{ cx: 16, cy: 16, r: 8, rgb: UNRIPE_RGB }]))).toEqual([]);
  });

  it('sorts several blobs by decreasing area', async () => {
    const two = discImage(96, 48, [
      { cx: 20, cy: 24, r: 6, rgb: RIPE_RGB },
      { cx: 70, cy: 24, r: 12, rgb: RIPE_RGB },
    ]);
    const dets = await hsvDetector(two);
    expect(dets).toHaveLength(2);
    expect(dets[0]!.bbox[2]).toBeGreaterThan(dets[1]!.bbox[2]);
  });
});
```

- [ ] **Step 2: Vérifier l'échec**

Run: `npx vitest run packages/sim/src/perception/components.test.ts packages/sim/src/perception/hsvDetector.test.ts`
Expected: FAIL, modules introuvables.

- [ ] **Step 3: Écrire `morphology.ts`**

```ts
/** Masque binaire (0 ou 1) de width × height ; hors image = 0. */
export type Mask = Uint8Array;

/** Vrai si le pixel (x, y) et ses 8 voisins valent tous `wanted` (hors image = 0). */
function neighbourhoodIs(mask: Mask, width: number, height: number, x: number, y: number, wanted: 0 | 1): boolean {
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      const nx = x + dx;
      const ny = y + dy;
      const v = nx < 0 || ny < 0 || nx >= width || ny >= height ? 0 : (mask[ny * width + nx] ?? 0);
      if (v !== wanted) return false;
    }
  }
  return true;
}

/** Érosion par un carré 3×3 : un pixel reste à 1 si lui et ses 8 voisins valent 1. */
export function erode3(mask: Mask, width: number, height: number): Mask {
  const out = new Uint8Array(width * height);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (mask[y * width + x] === 1 && neighbourhoodIs(mask, width, height, x, y, 1)) out[y * width + x] = 1;
    }
  }
  return out;
}

/** Dilatation par un carré 3×3 : un pixel passe à 1 si lui ou l'un de ses 8 voisins vaut 1. */
export function dilate3(mask: Mask, width: number, height: number): Mask {
  const out = new Uint8Array(width * height);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (!neighbourhoodIs(mask, width, height, x, y, 0)) out[y * width + x] = 1;
    }
  }
  return out;
}

/** Ouverture morphologique 3×3 (érosion puis dilatation) : supprime le bruit isolé, conserve les blobs. */
export function open3(mask: Mask, width: number, height: number): Mask {
  return dilate3(erode3(mask, width, height), width, height);
}
```

- [ ] **Step 4: Écrire `components.ts`**

```ts
import type { Mask } from './morphology';

/** Composante connexe (4-connexité) d'un masque binaire : boîte englobante inclusive et aire en pixels. */
export interface Component {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
  area: number;
}

/** Étiquetage par remplissage avec une pile explicite (pas de récursion). Ordre : première apparition en balayage. */
export function labelComponents(mask: Mask, width: number, height: number): Component[] {
  const seen = new Uint8Array(width * height);
  const stack = new Int32Array(width * height);
  const out: Component[] = [];
  for (let start = 0; start < width * height; start++) {
    if (mask[start] !== 1 || seen[start] === 1) continue;
    const c: Component = { minX: width, minY: height, maxX: -1, maxY: -1, area: 0 };
    let top = 0;
    stack[top++] = start;
    seen[start] = 1;
    const push = (j: number): void => {
      if (mask[j] === 1 && seen[j] !== 1) {
        seen[j] = 1;
        stack[top++] = j;
      }
    };
    while (top > 0) {
      const i = stack[--top] ?? 0;
      const x = i % width;
      const y = (i - x) / width;
      c.area++;
      if (x < c.minX) c.minX = x;
      if (x > c.maxX) c.maxX = x;
      if (y < c.minY) c.minY = y;
      if (y > c.maxY) c.maxY = y;
      if (x > 0) push(i - 1);
      if (x < width - 1) push(i + 1);
      if (y > 0) push(i - width);
      if (y < height - 1) push(i + width);
    }
    out.push(c);
  }
  return out;
}
```

- [ ] **Step 5: Écrire `testImages.ts`**

```ts
import { makeRgba } from './rgba';
import type { RgbaImage } from './types';

export interface Disc {
  cx: number;
  cy: number;
  r: number;
  rgb: readonly [number, number, number];
}

/** Rouge mûr, orange en transition et vert immature de la palette (#c8261b, #e08a1e, #3f9a3a). */
export const RIPE_RGB: readonly [number, number, number] = [200, 38, 27];
export const TURNING_RGB: readonly [number, number, number] = [224, 138, 30];
export const UNRIPE_RGB: readonly [number, number, number] = [63, 154, 58];
/** Fond gris sombre de la serre. */
export const BACKGROUND_RGB: readonly [number, number, number] = [40, 44, 42];

/** Image de test : fond uniforme et disques pleins, pour les tests des détecteurs. */
export function discImage(width: number, height: number, discs: readonly Disc[]): RgbaImage {
  const img = makeRgba(width, height, BACKGROUND_RGB);
  for (const d of discs) {
    for (let y = Math.max(0, Math.floor(d.cy - d.r)); y <= Math.min(height - 1, Math.ceil(d.cy + d.r)); y++) {
      for (let x = Math.max(0, Math.floor(d.cx - d.r)); x <= Math.min(width - 1, Math.ceil(d.cx + d.r)); x++) {
        if ((x - d.cx) ** 2 + (y - d.cy) ** 2 <= d.r * d.r) img.data.set([d.rgb[0], d.rgb[1], d.rgb[2], 255], (y * width + x) * 4);
      }
    }
  }
  return img;
}
```

- [ ] **Step 6: Écrire `hsvDetector.ts`**

```ts
import { labelComponents } from './components';
import { open3, type Mask } from './morphology';
import { rgbToHsv } from './rgba';
import type { Detection, RgbaImage, RipeDetector } from './types';

/** Rouge en teinte OpenCV (0..180) : H < 10 ou H > 170. */
export const RED_HUE_LOW_MAX = 10;
export const RED_HUE_HIGH_MIN = 170;
/** Saturation et valeur minimales (0..255) : excluent le fond gris et les ombres profondes. */
export const RED_SAT_MIN = 100;
export const RED_VAL_MIN = 80;
/** Aire minimale d'un blob après ouverture, en pixels d'une image 640 px (≈ un disque de 5 px de rayon). */
export const MIN_BLOB_AREA_PX = 80;

/** Masque des pixels rouges, saturés et suffisamment lumineux. */
export function redMask(img: RgbaImage): Mask {
  const n = img.width * img.height;
  const mask = new Uint8Array(n);
  for (let i = 0; i < n; i++) {
    const o = i * 4;
    const [h, s, v] = rgbToHsv(img.data[o] ?? 0, img.data[o + 1] ?? 0, img.data[o + 2] ?? 0);
    if ((h < RED_HUE_LOW_MAX || h > RED_HUE_HIGH_MIN) && s > RED_SAT_MIN && v > RED_VAL_MIN) mask[i] = 1;
  }
  return mask;
}

/**
 * Détecteur de secours (spec 4.4) : masque rouge → ouverture 3×3 → composantes connexes → aire minimale.
 * Score = taux de remplissage de la boîte (≈ 0,78 pour un disque). Résultat trié par aire décroissante.
 */
export const hsvDetector: RipeDetector = (img) => {
  const opened = open3(redMask(img), img.width, img.height);
  const comps = labelComponents(opened, img.width, img.height).filter((c) => c.area >= MIN_BLOB_AREA_PX);
  comps.sort((a, b) => b.area - a.area);
  return comps.map((c): Detection => {
    const w = c.maxX - c.minX + 1;
    const h = c.maxY - c.minY + 1;
    return { bbox: [c.minX, c.minY, w, h], score: Math.min(1, c.area / (w * h)), label: 'ripe' };
  });
};
```

- [ ] **Step 7: Vérifier le succès**

Run: `npx vitest run packages/sim/src/perception/components.test.ts packages/sim/src/perception/hsvDetector.test.ts`
Expected: PASS, 11 tests (components 6, hsvDetector 5).

- [ ] **Step 8: Commit**

```bash
git add packages/sim/src/perception/morphology.ts packages/sim/src/perception/components.ts packages/sim/src/perception/components.test.ts packages/sim/src/perception/testImages.ts packages/sim/src/perception/hsvDetector.ts packages/sim/src/perception/hsvDetector.test.ts
git commit -m "feat(perception): détecteur HSV pur — masque rouge, ouverture 3×3, composantes connexes, aire minimale"
```

---

### Task 4: Letterbox, décodage YOLOv8 et NMS (`yoloDecode.ts`)

**Files:**
- Create: `packages/sim/src/perception/yoloDecode.ts`, `packages/sim/src/perception/yoloDecode.test.ts`

**Interfaces:**
- Produces:
  - `const YOLO_INPUT_PX = 640`, `YOLO_DECODE_SCORE_MIN = 0.25`, `YOLO_IOU_THRESHOLD = 0.45`
  - `interface Letterboxed { tensor: Float32Array; size; scale; padX; padY }`, `letterbox(img, size): Letterboxed` (CHW, RGB, 0..1, fond gris 114), `unletterbox(det, lb): Detection`
  - `labelFromName(name): DetectionLabel`, `interface ModelMeta { names: string[] }`, `parseModelMeta(value: unknown): ModelMeta | null`
  - `decodeYolo(data: Float32Array, dims: readonly number[], labels: readonly DetectionLabel[], scoreMin): Detection[]` (dims `[1, 4 + nc, N]`, lignes cx, cy, w, h puis scores sigmoïdes par classe, sans objectness — format vérifié sur l'export réel : `[1, 6, 8400]`)
  - `iou(a, b): number`, `nms(dets, iouThreshold): Detection[]` (glouton, par classe)

- [ ] **Step 1: Test (échoue)**

`packages/sim/src/perception/yoloDecode.test.ts` :

```ts
import { describe, expect, it } from 'vitest';
import { makeRgba } from './rgba';
import type { Detection } from './types';
import { decodeYolo, iou, labelFromName, letterbox, nms, parseModelMeta, unletterbox } from './yoloDecode';

describe('letterbox / unletterbox', () => {
  it('centres a 4×2 image in a 4×4 square with grey bands and CHW planes in 0..1', () => {
    const img = makeRgba(4, 2, [255, 0, 0]);
    const lb = letterbox(img, 4);
    expect(lb).toMatchObject({ size: 4, scale: 1, padX: 0, padY: 1 });
    expect(lb.tensor.length).toBe(3 * 16);
    expect(lb.tensor[0]).toBeCloseTo(114 / 255); // bande grise, canal R, ligne 0
    expect(lb.tensor[4]).toBe(1); // ligne 1, canal R = 255
    expect(lb.tensor[16 + 4]).toBe(0); // canal G
    expect(lb.tensor[32 + 4]).toBe(0); // canal B
    expect(lb.tensor[12]).toBeCloseTo(114 / 255); // bande grise, ligne 3
  });

  it('scales an 800 px square to 640 without padding and maps boxes back', () => {
    const lb = letterbox(makeRgba(800, 800), 640);
    expect(lb).toMatchObject({ scale: 0.8, padX: 0, padY: 0 });
    const back = unletterbox({ bbox: [80, 80, 160, 160], score: 0.9, label: 'ripe' }, lb);
    expect(back.bbox).toEqual([100, 100, 200, 200]);
  });

  it('removes the vertical padding when mapping back', () => {
    const lb = letterbox(makeRgba(4, 2), 4);
    expect(unletterbox({ bbox: [1, 1, 2, 1], score: 1, label: 'ripe' }, lb).bbox).toEqual([1, 0, 2, 1]);
  });
});

describe('labelFromName / parseModelMeta', () => {
  it('maps class names to ripe/unripe, unripe taking precedence', () => {
    expect(labelFromName('ripe')).toBe('ripe');
    expect(labelFromName('Ripe_Tomato')).toBe('ripe');
    expect(labelFromName('unripe')).toBe('unripe');
    expect(labelFromName('green')).toBe('unripe');
  });

  it('accepts { names: string[] } and rejects anything else', () => {
    expect(parseModelMeta({ names: ['unripe', 'ripe'], imgsz: 640 })).toEqual({ names: ['unripe', 'ripe'] });
    expect(parseModelMeta({ names: [] })).toBeNull();
    expect(parseModelMeta({ names: [1] })).toBeNull();
    expect(parseModelMeta('<!doctype html>')).toBeNull();
    expect(parseModelMeta(null)).toBeNull();
  });
});

/** Tenseur synthétique [1, 6, 5] : 5 ancres, colonnes cx, cy, w, h, score unripe, score ripe. */
function syntheticOutput(): { data: Float32Array; dims: number[] } {
  const anchors = [
    [100, 100, 50, 50, 0.05, 0.9], // ripe
    [104, 102, 50, 50, 0.1, 0.8], // doublon de la précédente (IoU élevé) → supprimé par NMS
    [300, 300, 40, 40, 0.7, 0.2], // unripe
    [500, 500, 30, 30, 0.1, 0.1], // sous le seuil
    [520, 200, 30, 30, 0.05, 0.5], // ripe isolée
  ];
  const n = anchors.length;
  const data = new Float32Array(6 * n);
  anchors.forEach((row, i) => row.forEach((v, c) => (data[c * n + i] = v)));
  return { data, dims: [1, 6, n] };
}

describe('decodeYolo + nms', () => {
  const labels = ['unripe', 'ripe'] as const;

  it('decodes cx/cy/w/h into x/y/w/h, picks the best class and drops low scores', () => {
    const { data, dims } = syntheticOutput();
    const raw = decodeYolo(data, dims, labels, 0.25);
    expect(raw).toHaveLength(4);
    expect(raw[0]).toEqual({ bbox: [75, 75, 50, 50], score: expect.closeTo(0.9, 5), label: 'ripe' });
    expect(raw[2]).toEqual({ bbox: [280, 280, 40, 40], score: expect.closeTo(0.7, 5), label: 'unripe' });
  });

  it('nms keeps three boxes sorted by score and removes the overlapping ripe duplicate', () => {
    const { data, dims } = syntheticOutput();
    const kept = nms(decodeYolo(data, dims, labels, 0.25), 0.45);
    expect(kept.map((d) => [d.label, Number(d.score.toFixed(1))])).toEqual([
      ['ripe', 0.9],
      ['unripe', 0.7],
      ['ripe', 0.5],
    ]);
  });

  it('returns nothing when dims or class count do not match', () => {
    const { data } = syntheticOutput();
    expect(decodeYolo(data, [1, 6, 5], ['ripe'], 0.25)).toEqual([]);
    expect(decodeYolo(data, [6, 5], labels, 0.25)).toEqual([]);
  });

  it('iou is 1 for identical boxes, 0 for disjoint ones, and nms does not merge across classes', () => {
    const a: Detection['bbox'] = [0, 0, 10, 10];
    expect(iou(a, a)).toBe(1);
    expect(iou(a, [20, 20, 5, 5])).toBe(0);
    expect(iou(a, [5, 0, 10, 10])).toBeCloseTo(1 / 3);
    const both: Detection[] = [
      { bbox: a, score: 0.9, label: 'ripe' },
      { bbox: a, score: 0.8, label: 'unripe' },
    ];
    expect(nms(both, 0.45)).toHaveLength(2);
  });
});
```

- [ ] **Step 2: Vérifier l'échec**

Run: `npx vitest run packages/sim/src/perception/yoloDecode.test.ts`
Expected: FAIL, module `./yoloDecode` introuvable.

- [ ] **Step 3: Écrire `yoloDecode.ts`**

```ts
import { resizeRgba } from './rgba';
import type { Detection, DetectionLabel, RgbaImage } from './types';

/** Côté de l'entrée du modèle (export Ultralytics `imgsz=640`) : tenseur `images` [1, 3, 640, 640]. */
export const YOLO_INPUT_PX = 640;
/** Seuil de score pour garder une boîte au décodage (avant NMS). */
export const YOLO_DECODE_SCORE_MIN = 0.25;
/** IoU au-delà duquel une boîte de même classe est supprimée par la NMS. */
export const YOLO_IOU_THRESHOLD = 0.45;
/** Gris de remplissage du letterbox (convention Ultralytics : 114). */
const LETTERBOX_FILL = 114;

export interface Letterboxed {
  /** CHW, RGB, valeurs 0..1, taille 3 × size × size. */
  tensor: Float32Array;
  size: number;
  scale: number;
  padX: number;
  padY: number;
}

export interface ModelMeta {
  names: string[];
}

/** Redimensionne l'image dans un carré `size` en gardant les proportions, centrée sur fond gris, en CHW normalisé. */
export function letterbox(img: RgbaImage, size: number): Letterboxed {
  const scale = size / Math.max(img.width, img.height);
  const w = Math.max(1, Math.round(img.width * scale));
  const h = Math.max(1, Math.round(img.height * scale));
  const padX = Math.floor((size - w) / 2);
  const padY = Math.floor((size - h) / 2);
  const resized = resizeRgba(img, w, h);
  const plane = size * size;
  const tensor = new Float32Array(3 * plane).fill(LETTERBOX_FILL / 255);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const src = (y * w + x) * 4;
      const dst = (y + padY) * size + (x + padX);
      tensor[dst] = (resized.data[src] ?? 0) / 255;
      tensor[plane + dst] = (resized.data[src + 1] ?? 0) / 255;
      tensor[2 * plane + dst] = (resized.data[src + 2] ?? 0) / 255;
    }
  }
  return { tensor, size, scale, padX, padY };
}

/** Ramène une boîte exprimée en pixels du letterbox vers les pixels de l'image d'origine. */
export function unletterbox(det: Detection, lb: Letterboxed): Detection {
  const [x, y, w, h] = det.bbox;
  return { ...det, bbox: [(x - lb.padX) / lb.scale, (y - lb.padY) / lb.scale, w / lb.scale, h / lb.scale] };
}

/** `unripe` prime sur `ripe` (« unripe » contient « ripe ») ; tout autre nom est traité comme immature. */
export function labelFromName(name: string): DetectionLabel {
  const n = name.toLowerCase();
  if (n.includes('unripe')) return 'unripe';
  return n.includes('ripe') ? 'ripe' : 'unripe';
}

/** Valide le fichier `tomato-ripe.json` écrit par `scripts/export-yolo.py`. */
export function parseModelMeta(value: unknown): ModelMeta | null {
  if (typeof value !== 'object' || value === null) return null;
  const names = (value as { names?: unknown }).names;
  if (!Array.isArray(names) || names.length === 0 || !names.every((n) => typeof n === 'string')) return null;
  return { names: names as string[] };
}

/**
 * Décode la sortie brute `output0` d'un export YOLOv8 de détection : dims [1, 4 + nc, N], lignes cx, cy, w, h
 * (pixels du letterbox) puis un score sigmoïde par classe, sans objectness. Garde le meilleur score par ancre.
 */
export function decodeYolo(data: Float32Array, dims: readonly number[], labels: readonly DetectionLabel[], scoreMin: number): Detection[] {
  const rows = dims[1] ?? 0;
  const n = dims[2] ?? 0;
  const nc = rows - 4;
  if (dims.length !== 3 || nc < 1 || nc !== labels.length || data.length < rows * n) return [];
  const out: Detection[] = [];
  for (let i = 0; i < n; i++) {
    let best = -1;
    let bestScore = 0;
    for (let c = 0; c < nc; c++) {
      const s = data[(4 + c) * n + i] ?? 0;
      if (s > bestScore) {
        bestScore = s;
        best = c;
      }
    }
    if (best < 0 || bestScore < scoreMin) continue;
    const cx = data[i] ?? 0;
    const cy = data[n + i] ?? 0;
    const w = data[2 * n + i] ?? 0;
    const h = data[3 * n + i] ?? 0;
    out.push({ bbox: [cx - w / 2, cy - h / 2, w, h], score: bestScore, label: labels[best] ?? 'unripe' });
  }
  return out;
}

export function iou(a: Detection['bbox'], b: Detection['bbox']): number {
  const x1 = Math.max(a[0], b[0]);
  const y1 = Math.max(a[1], b[1]);
  const x2 = Math.min(a[0] + a[2], b[0] + b[2]);
  const y2 = Math.min(a[1] + a[3], b[1] + b[3]);
  const inter = Math.max(0, x2 - x1) * Math.max(0, y2 - y1);
  const union = a[2] * a[3] + b[2] * b[3] - inter;
  return union <= 0 ? 0 : inter / union;
}

/** Suppression des non-maxima gloutonne, par classe ; résultat trié par score décroissant. */
export function nms(dets: readonly Detection[], iouThreshold: number): Detection[] {
  const sorted = [...dets].sort((a, b) => b.score - a.score);
  const kept: Detection[] = [];
  for (const d of sorted) {
    if (kept.every((k) => k.label !== d.label || iou(k.bbox, d.bbox) <= iouThreshold)) kept.push(d);
  }
  return kept;
}
```

- [ ] **Step 4: Vérifier le succès**

Run: `npx vitest run packages/sim/src/perception/yoloDecode.test.ts`
Expected: PASS, 9 tests.

- [ ] **Step 5: Commit**

```bash
git add packages/sim/src/perception/yoloDecode.ts packages/sim/src/perception/yoloDecode.test.ts
git commit -m "feat(perception): letterbox 640, décodage de la sortie YOLOv8 [1, 4+nc, N], NMS par classe, classes du modèle"
```

---

### Task 5: Association détection ↔ tomate et porte de réveil

**Files:**
- Create: `packages/sim/src/perception/matching.ts`, `packages/sim/src/perception/matching.test.ts`, `packages/sim/src/perception/wakeGate.ts`, `packages/sim/src/perception/wakeGate.test.ts`

**Interfaces:**
- Consumes: `Vec2`, `Vec3` de `@tomato/shared`.
- Produces:
  - `const MATCH_RADIUS_FACTOR = 0.75`, `interface TomatoRef { id: number; positionCm: Vec3 }`, `interface Match { tomatoId; score; distancePx }`, `matchDetections(detections, tomatoes, project: (posCm: Vec3) => Vec2): Match[]`
  - `const DEFAULT_CONSECUTIVE_FRAMES = 5`, `interface WakeGate { push(tomatoId: number | null): number | null; reset(): void }`, `createWakeGate(n = 5): WakeGate`

- [ ] **Step 1: Tests (échouent)**

`packages/sim/src/perception/matching.test.ts` :

```ts
import { describe, expect, it } from 'vitest';
import type { Vec2, Vec3 } from '@tomato/shared';
import { matchDetections } from './matching';
import type { Detection } from './types';

/** Projection de test : X → px, Z → py (la profondeur Y est ignorée). */
const project = (p: Vec3): Vec2 => [p[0], p[2]];

const tomatoes = [
  { id: 1, positionCm: [100, 0, 100] as Vec3 },
  { id: 2, positionCm: [300, 0, 300] as Vec3 },
];

describe('matchDetections', () => {
  it('matches a box whose centre is near the projected tomato and ignores far boxes', () => {
    const dets: Detection[] = [
      { bbox: [84, 78, 40, 40], score: 0.8, label: 'ripe' }, // centre (104, 98) → tomate 1
      { bbox: [480, 480, 40, 40], score: 0.9, label: 'ripe' }, // loin de tout
    ];
    expect(matchDetections(dets, tomatoes, project)).toEqual([{ tomatoId: 1, score: 0.8, distancePx: expect.closeTo(Math.hypot(4, 2), 5) }]);
  });

  it('keeps the best score per tomato and sorts by score', () => {
    const dets: Detection[] = [
      { bbox: [280, 280, 40, 40], score: 0.5, label: 'ripe' },
      { bbox: [285, 282, 40, 40], score: 0.7, label: 'ripe' },
      { bbox: [80, 80, 40, 40], score: 0.6, label: 'ripe' },
    ];
    const m = matchDetections(dets, tomatoes, project);
    expect(m.map((x) => [x.tomatoId, x.score])).toEqual([
      [2, 0.7],
      [1, 0.6],
    ]);
  });

  it('ignores unripe detections and returns nothing without tomatoes', () => {
    const dets: Detection[] = [{ bbox: [80, 80, 40, 40], score: 0.9, label: 'unripe' }];
    expect(matchDetections(dets, tomatoes, project)).toEqual([]);
    expect(matchDetections([{ bbox: [80, 80, 40, 40], score: 0.9, label: 'ripe' }], [], project)).toEqual([]);
  });

  it('uses the box size as the tolerance (small box, same offset → rejected)', () => {
    const dets: Detection[] = [{ bbox: [104, 98, 4, 4], score: 0.9, label: 'ripe' }]; // centre (106, 100), 6 px de la tomate 1, boîte de 4 px
    expect(matchDetections(dets, tomatoes, project)).toEqual([]);
  });
});
```

`packages/sim/src/perception/wakeGate.test.ts` :

```ts
import { describe, expect, it } from 'vitest';
import { DEFAULT_CONSECUTIVE_FRAMES, createWakeGate } from './wakeGate';

describe('createWakeGate', () => {
  it('fires exactly on the n-th consecutive observation of the same id', () => {
    const g = createWakeGate(3);
    expect(g.push(1)).toBeNull();
    expect(g.push(1)).toBeNull();
    expect(g.push(1)).toBe(1);
    expect(g.push(1)).toBeNull(); // déjà signalé : pas de doublon
  });

  it('restarts the count when the id changes or disappears', () => {
    const g = createWakeGate(3);
    g.push(1);
    g.push(1);
    expect(g.push(null)).toBeNull();
    expect(g.push(1)).toBeNull();
    expect(g.push(1)).toBeNull();
    expect(g.push(2)).toBeNull();
    expect(g.push(2)).toBeNull();
    expect(g.push(2)).toBe(2);
  });

  it('defaults to 5 frames and reset() clears the count', () => {
    const g = createWakeGate();
    for (let i = 0; i < DEFAULT_CONSECUTIVE_FRAMES - 1; i++) expect(g.push(7)).toBeNull();
    g.reset();
    expect(g.push(7)).toBeNull();
    for (let i = 0; i < DEFAULT_CONSECUTIVE_FRAMES - 2; i++) expect(g.push(7)).toBeNull();
    expect(g.push(7)).toBe(7);
  });

  it('with n = 1 fires on the first observation', () => {
    expect(createWakeGate(1).push(3)).toBe(3);
  });
});
```

- [ ] **Step 2: Vérifier l'échec**

Run: `npx vitest run packages/sim/src/perception/matching.test.ts packages/sim/src/perception/wakeGate.test.ts`
Expected: FAIL, modules introuvables.

- [ ] **Step 3: Écrire `matching.ts`**

```ts
import type { Vec2, Vec3 } from '@tomato/shared';
import type { Detection } from './types';

/** Distance maximale entre le centre d'une boîte et la projection d'une tomate, en fraction du grand côté. */
export const MATCH_RADIUS_FACTOR = 0.75;

export interface TomatoRef {
  id: number;
  positionCm: Vec3;
}

export interface Match {
  tomatoId: number;
  score: number;
  distancePx: number;
}

/**
 * Associe chaque détection `ripe` à la tomate dont le centre projeté est le plus proche du centre de la boîte,
 * si cette distance est inférieure à MATCH_RADIUS_FACTOR × max(w, h). Une tomate n'apparaît qu'une fois
 * (meilleur score). Résultat trié par score décroissant.
 */
export function matchDetections(
  detections: readonly Detection[],
  tomatoes: readonly TomatoRef[],
  project: (posCm: Vec3) => Vec2,
): Match[] {
  const projected = tomatoes.map((t) => ({ id: t.id, px: project(t.positionCm) }));
  const best = new Map<number, Match>();
  for (const d of detections) {
    if (d.label !== 'ripe') continue;
    const [x, y, w, h] = d.bbox;
    const cx = x + w / 2;
    const cy = y + h / 2;
    let nearest: { id: number; dist: number } | null = null;
    for (const t of projected) {
      const dist = Math.hypot(t.px[0] - cx, t.px[1] - cy);
      if (nearest === null || dist < nearest.dist) nearest = { id: t.id, dist };
    }
    if (nearest === null || nearest.dist > MATCH_RADIUS_FACTOR * Math.max(w, h)) continue;
    const previous = best.get(nearest.id);
    if (!previous || d.score > previous.score) best.set(nearest.id, { tomatoId: nearest.id, score: d.score, distancePx: nearest.dist });
  }
  return [...best.values()].sort((a, b) => b.score - a.score);
}
```

- [ ] **Step 4: Écrire `wakeGate.ts`**

```ts
/** Nombre de frames consécutives « mûre » avant réveil (spec 3, N configurable, défaut 5). */
export const DEFAULT_CONSECUTIVE_FRAMES = 5;

export interface WakeGate {
  /** Une observation par tick : l'identifiant vu mûr, ou null. Renvoie l'identifiant à la n-ième observation consécutive, sinon null. */
  push(tomatoId: number | null): number | null;
  reset(): void;
}

/** Compteur de vues consécutives d'un même identifiant ; tout changement (autre id ou null) remet à zéro. */
export function createWakeGate(n: number = DEFAULT_CONSECUTIVE_FRAMES): WakeGate {
  let current: number | null = null;
  let count = 0;
  return {
    push(tomatoId) {
      if (tomatoId === null || tomatoId !== current) {
        current = tomatoId;
        count = tomatoId === null ? 0 : 1;
      } else {
        count++;
      }
      return current !== null && count === n ? current : null;
    },
    reset() {
      current = null;
      count = 0;
    },
  };
}
```

- [ ] **Step 5: Vérifier le succès**

Run: `npx vitest run packages/sim/src/perception/matching.test.ts packages/sim/src/perception/wakeGate.test.ts`
Expected: PASS, 8 tests.

- [ ] **Step 6: Commit**

```bash
git add packages/sim/src/perception/matching.ts packages/sim/src/perception/matching.test.ts packages/sim/src/perception/wakeGate.ts packages/sim/src/perception/wakeGate.test.ts
git commit -m "feat(perception): association des détections aux tomates projetées et porte de réveil à n vues consécutives"
```

---

### Task 6: Contours Canny + CLAHE sur OpenCV.js (`cannyClahe.ts`)

**Files:**
- Create: `packages/sim/src/perception/cannyClahe.ts`, `packages/sim/src/perception/cannyClahe.test.ts`

**Interfaces:**
- Consumes: `EdgeFilter` (type) de `../cameras/edges`.
- Produces:
  - `const CANNY_LOW = 50`, `CANNY_HIGH = 150`, `CLAHE_CLIP_LIMIT = 2`, `CLAHE_TILES = 8`
  - `interface CvMat { readonly data: Uint8Array; readonly rows; readonly cols; delete(): void }`, `interface CvSize { width; height }`, `interface CvClahe { apply(src, dst): void; delete(): void }`, `interface CvApi { Mat: new () => CvMat; Size: new (w, h) => CvSize; CLAHE: new (clip, grid: CvSize) => CvClahe; COLOR_RGBA2GRAY: number; matFromImageData(img: RgbaImage): CvMat; cvtColor(src, dst, code): void; Canny(image, edges, t1, t2, apertureSize, l2gradient): void }` — le vrai module `cv` de `@techstark/opencv-js` 4.11 est assignable à `CvApi` (vérifié par `tsc` : `const cv: CvApi = await mod.default`).
  - `edgesToWhiteRgba(edges: Uint8Array, pixelCount): Uint8ClampedArray<ArrayBuffer>`, `cannyClaheRgba(cv, img): Uint8ClampedArray<ArrayBuffer>`, `createCannyClaheFilter(cv): EdgeFilter` (navigateur : `new ImageData`), `loadOpenCv(): Promise<CvApi | null>` (import dynamique, jamais d'exception)

- [ ] **Step 1: Test (échoue)**

`packages/sim/src/perception/cannyClahe.test.ts` :

```ts
import { describe, expect, it } from 'vitest';
import { CANNY_HIGH, CANNY_LOW, CLAHE_CLIP_LIMIT, CLAHE_TILES, cannyClaheRgba, edgesToWhiteRgba, type CvApi, type CvMat } from './cannyClahe';
import { makeRgba } from './rgba';

interface FakeState {
  calls: string[];
  deleted: string[];
}

/** Faux OpenCV : enregistre les appels, Canny écrit un contour au pixel 5, Mat.delete est tracé. */
function fakeCv(state: FakeState, cannyThrows = false): CvApi {
  let counter = 0;
  class FakeMat implements CvMat {
    readonly name = `mat${counter++}`;
    data = new Uint8Array(0);
    rows = 0;
    cols = 0;
    delete(): void {
      state.deleted.push(this.name);
    }
  }
  return {
    Mat: FakeMat,
    Size: class {
      constructor(
        public width: number,
        public height: number,
      ) {}
    },
    CLAHE: class {
      constructor(clip: number, grid: { width: number; height: number }) {
        state.calls.push(`CLAHE(${clip},${grid.width}x${grid.height})`);
      }
      apply(src: CvMat, dst: CvMat): void {
        state.calls.push('apply');
        (dst as FakeMat).data = new Uint8Array(src.data);
      }
      delete(): void {
        state.deleted.push('clahe');
      }
    },
    COLOR_RGBA2GRAY: 11,
    matFromImageData: (img) => {
      const m = new FakeMat();
      m.data = new Uint8Array(img.data);
      m.rows = img.height;
      m.cols = img.width;
      state.calls.push('matFromImageData');
      return m;
    },
    cvtColor: (src, dst, code) => {
      state.calls.push(`cvtColor(${code})`);
      (dst as FakeMat).data = new Uint8Array(src.data.length / 4);
    },
    Canny: (image, edges, t1, t2, aperture, l2) => {
      state.calls.push(`Canny(${t1},${t2},${aperture},${l2})`);
      if (cannyThrows) throw new Error('boom');
      const out = new Uint8Array(image.data.length);
      out[5] = 255;
      (edges as FakeMat).data = out;
    },
  };
}

describe('edgesToWhiteRgba', () => {
  it('writes opaque white on edge pixels and transparent black elsewhere', () => {
    expect(Array.from(edgesToWhiteRgba(new Uint8Array([0, 255, 0]), 3))).toEqual([0, 0, 0, 0, 255, 255, 255, 255, 0, 0, 0, 0]);
  });
});

describe('cannyClaheRgba', () => {
  it('runs gray → CLAHE(2, 8×8) → Canny(50, 150) and frees every Mat and the CLAHE', () => {
    const state: FakeState = { calls: [], deleted: [] };
    const out = cannyClaheRgba(fakeCv(state), makeRgba(4, 4, [10, 20, 30]));
    expect(state.calls).toEqual(['matFromImageData', `CLAHE(${CLAHE_CLIP_LIMIT},${CLAHE_TILES}x${CLAHE_TILES})`, 'cvtColor(11)', 'apply', `Canny(${CANNY_LOW},${CANNY_HIGH},3,false)`]);
    expect(out.length).toBe(4 * 4 * 4);
    expect(Array.from(out.subarray(5 * 4, 5 * 4 + 4))).toEqual([255, 255, 255, 255]);
    expect(Array.from(out.subarray(0, 4))).toEqual([0, 0, 0, 0]);
    expect(state.deleted.sort()).toEqual(['clahe', 'mat0', 'mat1', 'mat2', 'mat3']);
  });

  it('still frees everything when Canny throws', () => {
    const state: FakeState = { calls: [], deleted: [] };
    expect(() => cannyClaheRgba(fakeCv(state, true), makeRgba(2, 2))).toThrow('boom');
    expect(state.deleted).toHaveLength(5);
  });
});
```

- [ ] **Step 2: Vérifier l'échec**

Run: `npx vitest run packages/sim/src/perception/cannyClahe.test.ts`
Expected: FAIL, module `./cannyClahe` introuvable.

- [ ] **Step 3: Écrire `cannyClahe.ts`**

```ts
import type { EdgeFilter } from '../cameras/edges';
import type { RgbaImage } from './types';

/** Seuils de Canny (spec 4.4 : 50/150), ouverture de Sobel 3, norme L1. */
export const CANNY_LOW = 50;
export const CANNY_HIGH = 150;
/** CLAHE : limite de contraste et grille de tuiles 8×8 (défauts usuels d'OpenCV). */
export const CLAHE_CLIP_LIMIT = 2;
export const CLAHE_TILES = 8;

/**
 * Sous-ensemble d'OpenCV.js utilisé par le filtre, en types structurels : le vrai module `cv` s'y conforme
 * (vérifié sur @techstark/opencv-js 4.11.0-release.1) et les tests Node passent un faux.
 * Note : `cv.createCLAHE` est déclaré dans les types mais absent à l'exécution ; c'est la classe `cv.CLAHE` qui existe.
 */
export interface CvMat {
  readonly data: Uint8Array;
  readonly rows: number;
  readonly cols: number;
  delete(): void;
}

export interface CvSize {
  width: number;
  height: number;
}

export interface CvClahe {
  apply(src: CvMat, dst: CvMat): void;
  delete(): void;
}

export interface CvApi {
  Mat: new () => CvMat;
  Size: new (width: number, height: number) => CvSize;
  CLAHE: new (clipLimit: number, tileGridSize: CvSize) => CvClahe;
  COLOR_RGBA2GRAY: number;
  matFromImageData(img: RgbaImage): CvMat;
  cvtColor(src: CvMat, dst: CvMat, code: number): void;
  Canny(image: CvMat, edges: CvMat, threshold1: number, threshold2: number, apertureSize: number, l2gradient: boolean): void;
}

/** Carte de contours CV_8UC1 (0 ou 255) → RGBA blanc opaque sur les contours, transparent ailleurs (contrat EdgeFilter). */
export function edgesToWhiteRgba(edges: Uint8Array, pixelCount: number): Uint8ClampedArray<ArrayBuffer> {
  const out = new Uint8ClampedArray(pixelCount * 4);
  for (let i = 0; i < pixelCount; i++) {
    if ((edges[i] ?? 0) > 0) out.set([255, 255, 255, 255], i * 4);
  }
  return out;
}

/** Niveaux de gris → CLAHE → Canny 50/150 ; libère chaque Mat même en cas d'erreur. */
export function cannyClaheRgba(cv: CvApi, img: RgbaImage): Uint8ClampedArray<ArrayBuffer> {
  const src = cv.matFromImageData(img);
  const gray = new cv.Mat();
  const equalized = new cv.Mat();
  const edges = new cv.Mat();
  const clahe = new cv.CLAHE(CLAHE_CLIP_LIMIT, new cv.Size(CLAHE_TILES, CLAHE_TILES));
  try {
    cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY);
    clahe.apply(gray, equalized);
    cv.Canny(equalized, edges, CANNY_LOW, CANNY_HIGH, 3, false);
    return edgesToWhiteRgba(edges.data, img.width * img.height);
  } finally {
    clahe.delete();
    edges.delete();
    equalized.delete();
    gray.delete();
    src.delete();
  }
}

/** Filtre de contours branché dans le pipeline des vues (M3) à la place de Sobel. Navigateur seulement (`ImageData`). */
export function createCannyClaheFilter(cv: CvApi): EdgeFilter {
  return (img) => new ImageData(cannyClaheRgba(cv, img), img.width, img.height);
}

/** Charge OpenCV.js une fois (≈ 11 Mo, import dynamique pour ne pas retarder la page) ; null si indisponible. */
export async function loadOpenCv(): Promise<CvApi | null> {
  try {
    const mod = await import('@techstark/opencv-js');
    const cv: CvApi = await mod.default;
    return cv;
  } catch (error) {
    console.warn('[perception] OpenCV.js indisponible, contours Sobel conservés', error);
    return null;
  }
}
```

- [ ] **Step 4: Vérifier le succès, le lint et le typecheck**

Run: `npx vitest run packages/sim/src/perception/cannyClahe.test.ts && npm run lint && npm run typecheck`
Expected: PASS, 3 tests ; lint et typecheck en 0 (l'assignation `const cv: CvApi = await mod.default` compile : `mod.default` est le namespace `cv` typé par `mirada`, dont `Mat`, `Size`, `CLAHE`, `matFromImageData`, `cvtColor`, `Canny` et `COLOR_RGBA2GRAY` sont structurellement compatibles).

- [ ] **Step 5: Commit**

```bash
git add packages/sim/src/perception/cannyClahe.ts packages/sim/src/perception/cannyClahe.test.ts
git commit -m "feat(perception): filtre de contours Canny + CLAHE sur une interface OpenCV structurelle, chargement dynamique d'OpenCV.js"
```

---

### Task 7: Orchestration du module avec dépendances injectées (`perceptionRuntime.ts`)

**Files:**
- Create: `packages/sim/src/perception/perceptionRuntime.ts`, `packages/sim/src/perception/perceptionRuntime.test.ts`

**Interfaces:**
- Consumes: `projectToPixel` de `../cameras/ortho` ; `SimContext`, `SimModule` de `../core/module` ; `VIEW_SIZE_PX`, `DetectorKind`, `WorldState` de `@tomato/shared` ; `testTomato` de `../cameras/testTomato` (tests).
- Produces:
  - `const PERCEPTION_PERIOD_S = 0.5`, `YOLO_ACCEPT_SCORE_MIN = 0.4`, `interface PerceptionOptions { consecutiveFrames; groundTruthGuard; periodS; yoloScoreMin }`, `DEFAULT_PERCEPTION_OPTIONS`
  - `interface PerceptionDeps { captureFront: (ctx: SimContext) => RgbaImage | null; hsv: RipeDetector; loadYolo: () => Promise<RipeDetector | null>; loadEdgeFilter: () => Promise<EdgeFilter | null>; setEdgeFilter: (f: EdgeFilter) => void; options?: Partial<PerceptionOptions> }`
  - `interface PerceptionModule extends SimModule { state(): PerceptionState; subscribe(fn): () => void; idle(): Promise<void>; loaded(): Promise<void> }`
  - `frontProjector(world, sizePx): (posCm: Vec3) => Vec2`, `createPerceptionModule(deps): PerceptionModule`
- Comportement : `init` écoute `plant_regenerated` (réarme) et lance les deux chargements sans bloquer le runtime ; `update(dtSimS)` accumule le temps sim, tick toutes les `periodS` (2 Hz), jamais deux détections en parallèle ; un tick = capture → YOLO si chargé et si une boîte `ripe` atteint 0,4, sinon HSV → association sur la projection `front` → candidat = meilleure tomate non encore annoncée (et `state === 'ripe'` si garde-fou) → porte → `ctx.emitEvent({ type: 'ripe_detected', tomatoId, detector, confidence })` une seule fois par tomate.

- [ ] **Step 1: Test (échoue)**

`packages/sim/src/perception/perceptionRuntime.test.ts` :

```ts
import { describe, expect, it } from 'vitest';
import { createDefaultWorld, type SimEvent, type Tomato, type TomatoState, type Vec3 } from '@tomato/shared';
import type { EdgeFilter } from '../cameras/edges';
import { testTomato } from '../cameras/testTomato';
import type { SimContext } from '../core/module';
import { createSignals } from '../core/signals';
import { createWorldStore } from '../core/store';
import { createPerceptionModule, frontProjector, type PerceptionDeps } from './perceptionRuntime';
import { makeRgba } from './rgba';
import { DETECTOR_INPUT_PX, type Detection, type RipeDetector } from './types';

const TOMATO_POS: Vec3 = [10, 0, 50];

function makeCtx(tomatoes: Tomato[]): { ctx: SimContext; events: SimEvent[] } {
  const events: SimEvent[] = [];
  const ctx: SimContext = {
    store: createWorldStore({ ...createDefaultWorld(1), tomatoes }),
    signals: createSignals(),
    emitEvent: (e) => events.push(e),
    scene: null,
    registry: { plantSpec: null },
  };
  return { ctx, events };
}

/** Détecteur qui renvoie une boîte de 40 px centrée sur la projection de TOMATO_POS. */
function detectorAt(score: number, calls: number[] = []): RipeDetector {
  return (img) => {
    calls.push(img.width);
    const world = { ...createDefaultWorld(1) };
    const [px, py] = frontProjector(world, img.width)(TOMATO_POS);
    const d: Detection = { bbox: [px - 20, py - 20, 40, 40], score, label: 'ripe' };
    return [d];
  };
}

const noEdges = async (): Promise<EdgeFilter | null> => null;

function deps(over: Partial<PerceptionDeps>, state: TomatoState = 'ripe'): { deps: PerceptionDeps; ctx: SimContext; events: SimEvent[] } {
  const { ctx, events } = makeCtx([testTomato(1, TOMATO_POS, state)]);
  const d: PerceptionDeps = {
    captureFront: () => makeRgba(DETECTOR_INPUT_PX, DETECTOR_INPUT_PX),
    hsv: detectorAt(0.8),
    loadYolo: async () => null,
    loadEdgeFilter: noEdges,
    setEdgeFilter: () => undefined,
    options: { consecutiveFrames: 3, periodS: 0.5 },
    ...over,
  };
  return { deps: d, ctx, events };
}

/** Avance le temps sim par pas de 0,25 s et attend chaque tick asynchrone. */
async function run(mod: ReturnType<typeof createPerceptionModule>, ctx: SimContext, steps: number): Promise<void> {
  for (let i = 0; i < steps; i++) {
    mod.update!(0.25, ctx);
    await mod.idle();
  }
}

describe('perception module (runtime pur)', () => {
  it('ticks at 2 Hz sim and emits ripe_detected once after n consecutive detections, tagged hsv', async () => {
    const calls: number[] = [];
    const { deps: d, ctx, events } = deps({ hsv: detectorAt(0.8, calls) });
    const mod = createPerceptionModule(d);
    mod.init(ctx);
    await mod.loaded();
    await run(mod, ctx, 4); // 1 s sim → 2 ticks
    expect(calls).toEqual([640, 640]);
    expect(events).toEqual([]);
    await run(mod, ctx, 2); // 3e tick
    expect(events).toEqual([{ type: 'ripe_detected', tomatoId: 1, detector: 'hsv', confidence: 0.8 }]);
    await run(mod, ctx, 10);
    expect(events).toHaveLength(1);
    expect(mod.state()).toMatchObject({ opencvReady: false, yoloReady: false, lastDetector: 'hsv' });
    expect(mod.state().lastDetections).toHaveLength(1);
  });

  it('ground-truth guard blocks a turning tomato; disabling it lets the detector wake the agent', async () => {
    const guarded = deps({}, 'turning');
    const m1 = createPerceptionModule(guarded.deps);
    m1.init(guarded.ctx);
    await run(m1, guarded.ctx, 12);
    expect(guarded.events).toEqual([]);

    const open = deps({ options: { consecutiveFrames: 3, groundTruthGuard: false } }, 'turning');
    const m2 = createPerceptionModule(open.deps);
    m2.init(open.ctx);
    await run(m2, open.ctx, 6);
    expect(open.events).toHaveLength(1);
  });

  it('prefers YOLO when its score reaches 0.4 and falls back to HSV below', async () => {
    const strong = deps({ loadYolo: async () => detectorAt(0.9) });
    const m1 = createPerceptionModule(strong.deps);
    m1.init(strong.ctx);
    await m1.loaded();
    expect(m1.state().yoloReady).toBe(true);
    await run(m1, strong.ctx, 6);
    expect(strong.events[0]).toMatchObject({ detector: 'yolo', confidence: 0.9 });

    const weak = deps({ loadYolo: async () => detectorAt(0.3), hsv: detectorAt(0.7) });
    const m2 = createPerceptionModule(weak.deps);
    m2.init(weak.ctx);
    await m2.loaded();
    await run(m2, weak.ctx, 6);
    expect(weak.events[0]).toMatchObject({ detector: 'hsv', confidence: 0.7 });
  });

  it('re-arms after plant_regenerated and wires the edge filter once OpenCV is ready', async () => {
    const set: EdgeFilter[] = [];
    const filter: EdgeFilter = (img) => img;
    const { deps: d, ctx, events } = deps({ loadEdgeFilter: async () => filter, setEdgeFilter: (f) => set.push(f) });
    const mod = createPerceptionModule(d);
    mod.init(ctx);
    await mod.loaded();
    expect(set).toEqual([filter]);
    expect(mod.state().opencvReady).toBe(true);
    await run(mod, ctx, 6);
    expect(events).toHaveLength(1);
    ctx.signals.emit({ type: 'plant_regenerated', seed: 2 });
    await run(mod, ctx, 6);
    expect(events).toHaveLength(2);
  });

  it('skips ticks without an image and never overlaps two detections', async () => {
    const calls: number[] = [];
    let release: (() => void) | null = null;
    const slow: RipeDetector = (img) => {
      calls.push(img.width);
      return new Promise<Detection[]>((resolve) => {
        release = () => resolve([]);
      });
    };
    const { deps: d, ctx } = deps({ hsv: slow });
    const mod = createPerceptionModule(d);
    mod.init(ctx);
    mod.update!(0.5, ctx);
    mod.update!(0.5, ctx);
    mod.update!(0.5, ctx);
    expect(calls).toHaveLength(1);
    release!();
    await mod.idle();
    mod.update!(0.5, ctx);
    expect(calls).toHaveLength(2);

    const none = deps({ captureFront: () => null, hsv: detectorAt(0.9, calls) });
    const m2 = createPerceptionModule(none.deps);
    m2.init(none.ctx);
    await run(m2, none.ctx, 6);
    expect(calls).toHaveLength(2);
  });

  it('notifies subscribers on every state change', async () => {
    const { deps: d, ctx } = deps({});
    const mod = createPerceptionModule(d);
    const seen: string[] = [];
    const off = mod.subscribe((s) => seen.push(`${s.yoloReady}/${s.lastDetector ?? '-'}`));
    mod.init(ctx);
    await mod.loaded();
    await run(mod, ctx, 2);
    off();
    await run(mod, ctx, 2);
    expect(seen).toEqual(['false/-', 'false/hsv']);
  });
});
```

- [ ] **Step 2: Vérifier l'échec**

Run: `npx vitest run packages/sim/src/perception/perceptionRuntime.test.ts`
Expected: FAIL, module `./perceptionRuntime` introuvable.

- [ ] **Step 3: Écrire `perceptionRuntime.ts`**

```ts
import { VIEW_SIZE_PX, type DetectorKind, type Vec2, type Vec3, type WorldState } from '@tomato/shared';
import type { EdgeFilter } from '../cameras/edges';
import { projectToPixel } from '../cameras/ortho';
import type { SimContext, SimModule } from '../core/module';
import { matchDetections } from './matching';
import type { Detection, PerceptionState, RgbaImage, RipeDetector } from './types';
import { DEFAULT_CONSECUTIVE_FRAMES, createWakeGate } from './wakeGate';

/** Période du détecteur en temps sim : 2 Hz (spec 4.4). */
export const PERCEPTION_PERIOD_S = 0.5;
/** Score YOLO minimal pour faire confiance au modèle ; en dessous, repli sur HSV (spec 4.4). */
export const YOLO_ACCEPT_SCORE_MIN = 0.4;

export interface PerceptionOptions {
  consecutiveFrames: number;
  /** Garde-fou de démo : n'annonce que des tomates dont `state === 'ripe'` dans le store (désactivable). */
  groundTruthGuard: boolean;
  periodS: number;
  yoloScoreMin: number;
}

export const DEFAULT_PERCEPTION_OPTIONS: PerceptionOptions = {
  consecutiveFrames: DEFAULT_CONSECUTIVE_FRAMES,
  groundTruthGuard: true,
  periodS: PERCEPTION_PERIOD_S,
  yoloScoreMin: YOLO_ACCEPT_SCORE_MIN,
};

/** Dépendances injectées : le navigateur fournit le rendu, OpenCV et ONNX ; les tests, des faux. */
export interface PerceptionDeps {
  /** Image brute de la caméra front du runtime courant (`ctx.scene`), déjà réduite au carré du détecteur ; null sans scène. */
  captureFront: (ctx: SimContext) => RgbaImage | null;
  hsv: RipeDetector;
  loadYolo: () => Promise<RipeDetector | null>;
  loadEdgeFilter: () => Promise<EdgeFilter | null>;
  setEdgeFilter: (filter: EdgeFilter) => void;
  options?: Partial<PerceptionOptions>;
}

export interface PerceptionModule extends SimModule {
  state(): PerceptionState;
  subscribe(fn: (state: PerceptionState) => void): () => void;
  /** Résolue quand le tick en cours (détection asynchrone) est terminé. */
  idle(): Promise<void>;
  /** Résolue quand les chargements lancés par `init` (OpenCV, YOLO) sont terminés. */
  loaded(): Promise<void>;
}

/** Projection monde → pixels de l'image du détecteur (vue front réduite de VIEW_SIZE_PX à sizePx). */
export function frontProjector(world: WorldState, sizePx: number): (posCm: Vec3) => Vec2 {
  const k = sizePx / VIEW_SIZE_PX;
  const pose = world.cameras.front;
  return (posCm) => {
    const [px, py] = projectToPixel('front', pose, posCm);
    return [px * k, py * k];
  };
}

export function createPerceptionModule(deps: PerceptionDeps): PerceptionModule {
  const opts: PerceptionOptions = { ...DEFAULT_PERCEPTION_OPTIONS, ...deps.options };
  const gate = createWakeGate(opts.consecutiveFrames);
  const announced = new Set<number>();
  const listeners = new Set<(s: PerceptionState) => void>();
  let state: PerceptionState = { opencvReady: false, yoloReady: false, lastDetector: null, lastDetections: [] };
  let yolo: RipeDetector | null = null;
  let accumulatedS = 0;
  let inFlight: Promise<void> | null = null;
  let loading: Promise<void> = Promise.resolve();

  const publish = (patch: Partial<PerceptionState>): void => {
    state = { ...state, ...patch };
    for (const fn of listeners) fn(state);
  };

  /** YOLO d'abord s'il est chargé et confiant ; sinon HSV. */
  async function detect(img: RgbaImage): Promise<{ detections: Detection[]; detector: DetectorKind }> {
    if (yolo) {
      try {
        const detections = await yolo(img);
        if (detections.some((d) => d.label === 'ripe' && d.score >= opts.yoloScoreMin)) return { detections, detector: 'yolo' };
      } catch (error) {
        console.warn('[perception] YOLO en erreur, HSV seul désormais', error);
        yolo = null;
        publish({ yoloReady: false });
      }
    }
    return { detections: await deps.hsv(img), detector: 'hsv' };
  }

  async function tick(ctx: SimContext, img: RgbaImage): Promise<void> {
    const world = ctx.store.get();
    const { detections, detector } = await detect(img);
    const trusted = detector === 'yolo' ? detections.filter((d) => d.score >= opts.yoloScoreMin) : detections;
    const matches = matchDetections(trusted, world.tomatoes, frontProjector(world, img.width));
    const byId = new Map(world.tomatoes.map((t) => [t.id, t]));
    const candidate =
      matches.find((m) => !announced.has(m.tomatoId) && (!opts.groundTruthGuard || byId.get(m.tomatoId)?.state === 'ripe')) ?? null;
    const woke = gate.push(candidate?.tomatoId ?? null);
    if (woke !== null && candidate) {
      announced.add(woke);
      ctx.emitEvent({ type: 'ripe_detected', tomatoId: woke, detector, confidence: candidate.score });
    }
    publish({ lastDetector: detector, lastDetections: detections });
  }

  return {
    name: 'perception',
    init(ctx) {
      ctx.signals.on('plant_regenerated', () => {
        announced.clear();
        gate.reset();
      });
      loading = Promise.all([
        deps.loadEdgeFilter().then((filter) => {
          if (!filter) return;
          deps.setEdgeFilter(filter);
          publish({ opencvReady: true });
        }),
        deps.loadYolo().then((detector) => {
          yolo = detector;
          publish({ yoloReady: detector !== null });
        }),
      ]).then(() => undefined);
    },
    update(dtSimS, ctx) {
      accumulatedS += dtSimS;
      if (accumulatedS < opts.periodS) return;
      accumulatedS = 0;
      if (inFlight) return;
      const img = deps.captureFront(ctx);
      if (!img) return;
      inFlight = tick(ctx, img)
        .catch((error: unknown) => console.warn('[perception] tick en erreur', error))
        .finally(() => {
          inFlight = null;
        });
    },
    state: () => state,
    subscribe: (fn) => {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    idle: () => inFlight ?? Promise.resolve(),
    loaded: () => loading,
  };
}
```

- [ ] **Step 4: Vérifier le succès**

Run: `npx vitest run packages/sim/src/perception`
Expected: PASS, 44 tests (rgba 7, components 6, hsvDetector 5, yoloDecode 9, matching 4, wakeGate 4, cannyClahe 3, perceptionRuntime 6).

- [ ] **Step 5: Commit**

```bash
git add packages/sim/src/perception/perceptionRuntime.ts packages/sim/src/perception/perceptionRuntime.test.ts
git commit -m "feat(perception): module à 2 Hz sim — YOLO puis repli HSV, association, garde-fou vérité terrain, un ripe_detected par tomate"
```

---

### Task 8: Points de branchement dans `cameras/` (seul code hors `perception/`)

**Files:**
- Modify: `packages/sim/src/cameras/renderViews.ts`, `packages/sim/src/cameras/cameraModule.ts`

**Interfaces:**
- Produces:
  - `setEdgeFilter(filter: EdgeFilter): void`, `getEdgeFilter(): EdgeFilter` dans `renderViews.ts` ; le pipeline appelle `getEdgeFilter()(base)` à chaque rendu au lieu d'un filtre capturé à la création.
  - `renderCameraImage(scene: SceneHandle, camId: CameraId): ImageData | null` dans `cameraModule.ts` : rendu brut sRGB 800×800 de la caméra de **cette** scène (helpers masqués pendant le rendu, comme `renderViews`), `null` sans scène (Node) ; les caméras sont mémorisées par scène dans une `WeakMap<SceneHandle, AgentCameras>` remplie à `init`.
- Règle : si `setEdgeFilter` ou `renderCameraImage` existent déjà dans `main` avec cette signature, ne rien changer. Sinon appliquer exactement les ajouts ci-dessous, sans toucher au reste du fichier. Toute autre différence avec le plan M3 (noms internes) est sans importance : les trois ajouts sont locaux.

- [ ] **Step 1: `renderViews.ts` — filtre courant**

Trois modifications : (a) après `export type RenderViews = …`, ajouter :

```ts
let currentEdgeFilter: EdgeFilter = sobelEdges;

/** Remplace le filtre de contours du pipeline (M4 : Canny + CLAHE une fois OpenCV.js chargé). */
export function setEdgeFilter(filter: EdgeFilter): void {
  currentEdgeFilter = filter;
}

export function getEdgeFilter(): EdgeFilter {
  return currentEdgeFilter;
}
```

(b) retirer le paramètre `edgeFilter: EdgeFilter = sobelEdges` de `createViewRenderer` (signature `createViewRenderer(ctx: SimContext, scene: SceneHandle, cams: AgentCameras): RenderViews`) ; (c) dans le pipeline, remplacer `edgeFilter(base)` par `getEdgeFilter()(base)`. `sobelEdges` et `EdgeFilter` restent importés de `./edges`. Résultat attendu de l'en-tête du fichier (imports inchangés) :

```ts
/** Le rendu est assombri à 35 % avant les contours (spec 4.5, couche 1). */
export const DARKEN_FACTOR = 0.35;
const DATA_URL_PREFIX = 'data:image/png;base64,';

export type RenderViews = (cameras: CameraId[]) => Promise<ViewsResult>;

let currentEdgeFilter: EdgeFilter = sobelEdges;

/** Remplace le filtre de contours du pipeline (M4 : Canny + CLAHE une fois OpenCV.js chargé). */
export function setEdgeFilter(filter: EdgeFilter): void {
  currentEdgeFilter = filter;
}

export function getEdgeFilter(): EdgeFilter {
  return currentEdgeFilter;
}
```

et, dans `createViewRenderer`, la ligne :

```ts
        ctx2d.putImageData(compose(darken(base, DARKEN_FACTOR), getEdgeFilter()(base)), 0, 0);
```

- [ ] **Step 2: `cameraModule.ts` — capture brute par scène**

Quatre modifications : (a) importer `CAMERA_IDS` de `@tomato/shared`, `SceneHandle` (type) de `../three/createScene` et `renderToImageData` de `./agentCameras` ; (b) déclarer, à côté des autres variables de module, `const camerasByScene = new WeakMap<SceneHandle, AgentCameras>();` ; (c) dans `init`, juste après la création des caméras (`const created = createAgentCameras(ctx.scene.scene);`), ajouter `camerasByScene.set(ctx.scene, created);` ; (d) ajouter la fonction exportée :

```ts
/** M4 : image brute (sRGB, 800×800) d'une caméra de la scène donnée, helpers masqués, sans annotation ; null sans scène. */
export function renderCameraImage(scene: SceneHandle, camId: CameraId): ImageData | null {
  const owned = camerasByScene.get(scene);
  if (!owned) return null;
  for (const id of CAMERA_IDS) owned[id].helper.visible = false;
  try {
    return renderToImageData(scene.renderer, scene.scene, owned[camId]);
  } finally {
    for (const id of CAMERA_IDS) owned[id].helper.visible = true;
  }
}
```

Fichier complet attendu si `main` contient `cameraModule.ts` tel que le plan M3 l'a écrit (sinon, appliquer les quatre modifications à la version mergée) :

```ts
import { CAMERA_IDS, type CameraId, type ViewsResult, type WorldState } from '@tomato/shared';
import type { SimModule } from '../core/module';
import type { SceneHandle } from '../three/createScene';
import { createAgentCameras, poseAllCameras, renderToImageData, type AgentCameras } from './agentCameras';
import { moveCamera } from './cameraState';
import { createViewRenderer } from './renderViews';

export type RenderViewsFn = (cameras: CameraId[]) => Promise<ViewsResult>;

let renderViewsFn: RenderViewsFn | null = null;
let cams: AgentCameras | null = null;
/** Caméras par scène : la page peut monter deux scènes (StrictMode) ; chaque runtime capture la sienne. */
const camerasByScene = new WeakMap<SceneHandle, AgentCameras>();
let lastPoses: WorldState['cameras'] | null = null;
const viewListeners = new Set<(result: ViewsResult) => void>();

/** La fonction `renderViews` du module, disponible après `init` avec une scène ; null en Node. */
export function getRenderViews(): RenderViewsFn | null {
  return renderViewsFn;
}

/** M4 : image brute (sRGB, 800×800) d'une caméra de la scène donnée, helpers masqués, sans annotation ; null sans scène. */
export function renderCameraImage(scene: SceneHandle, camId: CameraId): ImageData | null {
  const owned = camerasByScene.get(scene);
  if (!owned) return null;
  for (const id of CAMERA_IDS) owned[id].helper.visible = false;
  try {
    return renderToImageData(scene.renderer, scene.scene, owned[camId]);
  } finally {
    for (const id of CAMERA_IDS) owned[id].helper.visible = true;
  }
}

/** Abonne un composant aux résultats de chaque `renderViews` (AgentViews). */
export function subscribeViews(fn: (result: ViewsResult) => void): () => void {
  viewListeners.add(fn);
  return () => viewListeners.delete(fn);
}

/** M3 : caméras orthographiques, action move_camera, vues annotées. Écrit `cameras` et `tomatoes[i].visibleIn`. */
export const cameraModule: SimModule = {
  name: 'cameras',
  init(ctx) {
    if (!ctx.scene) return;
    const created = createAgentCameras(ctx.scene.scene);
    cams = created;
    camerasByScene.set(ctx.scene, created);
    lastPoses = ctx.store.get().cameras;
    poseAllCameras(created, lastPoses);
    const render = createViewRenderer(ctx, ctx.scene, created);
    renderViewsFn = async (cameras) => {
      const result = await render(cameras);
      for (const fn of viewListeners) fn(result);
      return result;
    };
  },
  update(_dtSimS, ctx) {
    if (!cams) return;
    const poses = ctx.store.get().cameras;
    if (poses === lastPoses) return;
    lastPoses = poses;
    poseAllCameras(cams, poses);
  },
  handle(action, ctx) {
    if (action.type !== 'move_camera') return null;
    const result = moveCamera(ctx.store.get(), action);
    if (result.ok) ctx.store.set(result.state);
    return result;
  },
};
```

- [ ] **Step 3: Vérifier lint, typecheck et tests de M3**

Run: `npm run lint && npm run typecheck && npx vitest run packages/sim/src/cameras`
Expected: exit 0 ; les tests M3 passent inchangés (`getRenderViews()` reste `null` en Node ; `renderCameraImage` n'est appelé par aucun test M3).

- [ ] **Step 4: Commit**

```bash
git add packages/sim/src/cameras/renderViews.ts packages/sim/src/cameras/cameraModule.ts
git commit -m "feat(cameras): setEdgeFilter/getEdgeFilter et renderCameraImage par scène — points de branchement de la perception (M4)"
```

---

### Task 9: YOLO dans le navigateur, module réel, pastille, `App.tsx`

**Files:**
- Create: `packages/sim/src/perception/yoloDetector.ts`, `packages/sim/src/perception/perceptionModule.ts`, `packages/sim/src/perception/PerceptionBadge.tsx`
- Modify: `packages/sim/src/App.tsx`

**Interfaces:**
- Produces:
  - `const YOLO_MODEL_URL = '/models/tomato-ripe.onnx'`, `YOLO_META_URL = '/models/tomato-ripe.json'`, `loadYoloDetector(modelUrl?, metaUrl?): Promise<RipeDetector | null>` — `fetch` des deux fichiers en refusant le HTML de repli de Vite (un fichier absent de `public/` est servi en `200 text/html`), `ort.env.wasm.wasmPaths = { wasm: ortWasmUrl }` (forme objet, vérifiée), `numThreads = 1`, `InferenceSession.create(bytes, { executionProviders: ['wasm'] })`, tenseur `float32 [1, 3, 640, 640]`, décodage + NMS + `unletterbox`. Jamais d'exception : `null` et un `console.info`/`warn`.
  - `perceptionModule: SimModule`, `perceptionState(): PerceptionState`, `subscribePerception(fn): () => void`, `window.__tomatoPerception = { state, events }` (Playwright).
  - `PerceptionBadge()` : trois pastilles (« contours Canny + CLAHE » / « contours Sobel (OpenCV.js en chargement) », « YOLOv8 ONNX + HSV » / « HSV seul (YOLO absent) », « dernier tick : HSV|YOLO · n boîte(s) »), `data-testid="perception-badge"`.

- [ ] **Step 1: Écrire `yoloDetector.ts`**

```ts
import * as ort from 'onnxruntime-web/wasm';
import ortWasmUrl from 'onnxruntime-web/ort-wasm-simd-threaded.wasm?url';
import type { RipeDetector } from './types';
import { YOLO_DECODE_SCORE_MIN, YOLO_INPUT_PX, YOLO_IOU_THRESHOLD, decodeYolo, labelFromName, letterbox, nms, parseModelMeta, unletterbox } from './yoloDecode';

/** Fichiers produits par `scripts/export-yolo.py` dans `packages/sim/public/models/` (le .onnx n'est pas versionné). */
export const YOLO_MODEL_URL = '/models/tomato-ripe.onnx';
export const YOLO_META_URL = '/models/tomato-ripe.json';

/** `fetch` qui refuse le HTML de repli : en dev, Vite renvoie `index.html` en 200 pour un fichier absent de `public/`. */
async function fetchAsset(url: string): Promise<Response | null> {
  const res = await fetch(url);
  const type = res.headers.get('content-type') ?? '';
  return res.ok && !type.includes('text/html') ? res : null;
}

function unavailable(reason: string): null {
  console.info(`[perception] YOLO désactivé (${reason}) : détecteur HSV seul`);
  return null;
}

/**
 * Charge le modèle YOLOv8 ripe/unripe avec onnxruntime-web (backend wasm, un seul thread : le multi-thread exige
 * un contexte cross-origin isolated que Vite ne fournit pas). Renvoie null, jamais d'exception, si le modèle,
 * ses classes ou le runtime manquent : la perception continue avec HSV (spec 10, coupe n° 1).
 */
export async function loadYoloDetector(modelUrl: string = YOLO_MODEL_URL, metaUrl: string = YOLO_META_URL): Promise<RipeDetector | null> {
  try {
    const metaRes = await fetchAsset(metaUrl);
    if (!metaRes) return unavailable('fichier de classes absent');
    const meta = parseModelMeta(await metaRes.json());
    if (!meta) return unavailable('fichier de classes invalide');
    const modelRes = await fetchAsset(modelUrl);
    if (!modelRes) return unavailable('modèle absent');
    ort.env.wasm.wasmPaths = { wasm: ortWasmUrl };
    ort.env.wasm.numThreads = 1;
    const session = await ort.InferenceSession.create(new Uint8Array(await modelRes.arrayBuffer()), { executionProviders: ['wasm'] });
    const inputName = session.inputNames[0];
    const outputName = session.outputNames[0];
    if (inputName === undefined || outputName === undefined) return unavailable('entrées/sorties inattendues');
    const labels = meta.names.map(labelFromName);
    return async (img) => {
      const lb = letterbox(img, YOLO_INPUT_PX);
      const feeds = { [inputName]: new ort.Tensor('float32', lb.tensor, [1, 3, YOLO_INPUT_PX, YOLO_INPUT_PX]) };
      const output = (await session.run(feeds))[outputName];
      if (!output || !(output.data instanceof Float32Array)) return [];
      return nms(decodeYolo(output.data, output.dims, labels, YOLO_DECODE_SCORE_MIN), YOLO_IOU_THRESHOLD).map((d) => unletterbox(d, lb));
    };
  } catch (error) {
    console.warn('[perception] YOLO indisponible, détecteur HSV seul', error);
    return null;
  }
}
```

- [ ] **Step 2: Écrire `perceptionModule.ts`**

```ts
import type { SimEvent } from '@tomato/shared';
import { renderCameraImage } from '../cameras/cameraModule';
import { setEdgeFilter } from '../cameras/renderViews';
import type { SimModule } from '../core/module';
import { createCannyClaheFilter, loadOpenCv } from './cannyClahe';
import { hsvDetector } from './hsvDetector';
import { createPerceptionModule } from './perceptionRuntime';
import { resizeRgba } from './rgba';
import { DETECTOR_INPUT_PX, type PerceptionState } from './types';
import { loadYoloDetector } from './yoloDetector';

declare global {
  interface Window {
    /** Exposé pour Playwright (`tests/perception.spec.ts`). */
    __tomatoPerception?: { state: () => PerceptionState; events: SimEvent[] };
  }
}

const runtime = createPerceptionModule({
  captureFront: (ctx) => {
    const img = ctx.scene ? renderCameraImage(ctx.scene, 'front') : null;
    return img ? resizeRgba(img, DETECTOR_INPUT_PX, DETECTOR_INPUT_PX) : null;
  },
  hsv: hsvDetector,
  loadYolo: () => loadYoloDetector(),
  loadEdgeFilter: async () => {
    const cv = await loadOpenCv();
    return cv ? createCannyClaheFilter(cv) : null;
  },
  setEdgeFilter,
});

/** M4 : contours Canny + CLAHE, détecteur mûr YOLO/HSV à 2 Hz sim, réveil `ripe_detected`. Après `cameraModule` dans MODULES. */
export const perceptionModule: SimModule = runtime;

/** État pour le dashboard : détecteur actif, disponibilité d'OpenCV et de YOLO, dernières boîtes. */
export const perceptionState = runtime.state;
export const subscribePerception = runtime.subscribe;

if (typeof window !== 'undefined') window.__tomatoPerception = { state: runtime.state, events: [] };
```

- [ ] **Step 3: Écrire `PerceptionBadge.tsx`**

```tsx
import { useEffect, useState } from 'react';
import { perceptionState, subscribePerception } from './perceptionModule';

/** Pastille de perception (spec 4.4 : « le dashboard affiche quel détecteur a déclenché »). M7 la reprend dans StatusBar. */
export function PerceptionBadge() {
  const [state, setState] = useState(perceptionState());
  useEffect(() => subscribePerception(setState), []);
  const edges = state.opencvReady ? 'contours Canny + CLAHE' : 'contours Sobel (OpenCV.js en chargement)';
  const model = state.yoloReady ? 'YOLOv8 ONNX + HSV' : 'HSV seul (YOLO absent)';
  const last = state.lastDetector
    ? `dernier tick : ${state.lastDetector.toUpperCase()} · ${state.lastDetections.length} boîte(s)`
    : 'aucune détection';
  return (
    <div data-testid="perception-badge" className="mb-3 flex flex-wrap gap-2 font-mono text-xs">
      <span className="rounded bg-neutral-800 px-2 py-1 text-neutral-200">{edges}</span>
      <span className="rounded bg-neutral-800 px-2 py-1 text-neutral-200">{model}</span>
      <span className={`rounded px-2 py-1 ${state.lastDetector === 'yolo' ? 'bg-fuchsia-900 text-fuchsia-100' : 'bg-neutral-800 text-neutral-300'}`}>{last}</span>
    </div>
  );
}
```

- [ ] **Step 4: Modifier `App.tsx`**

Trois changements, indépendants du contenu laissé par M1, M2, M3 : (a) ajouter les imports `import { PerceptionBadge } from './perception/PerceptionBadge';` et `import { perceptionModule } from './perception/perceptionModule';` (ordre alphabétique des chemins, après `./core/…`) ; (b) ajouter `perceptionModule` **en dernier** dans `MODULES` (après `cameraModule`, quel que soit le reste : par exemple `[plantModule, robotModule, cameraModule, perceptionModule]`) ; (c) dans l'`aside`, insérer `<PerceptionBadge />` juste avant `<AgentViews />`. Rien d'autre ne change (le `declare global`, la publication de `window.__tomato` et la garde StrictMode de M1 restent tels quels). Exemple de résultat lorsque `main` contient M1 et M3 (version validée dans le scratch, M2 absent) :

```tsx
import { useCallback } from 'react';
import { createDefaultWorld, type CameraId, type ViewsResult } from '@tomato/shared';
import { AgentViews } from './cameras/AgentViews';
import { cameraModule, getRenderViews } from './cameras/cameraModule';
import { createRuntime, type SimRuntime } from './core/runtime';
import type { SimModule } from './core/module';
import { PerceptionBadge } from './perception/PerceptionBadge';
import { perceptionModule } from './perception/perceptionModule';
import { plantModule } from './plant/plantModule';
import { SpectatorView } from './three/SpectatorView';
import type { SceneHandle } from './three/createScene';

const SEED = 20260917;

const MODULES: SimModule[] = [plantModule, cameraModule, perceptionModule];

declare global {
  interface Window {
    __tomato?: { runtime: SimRuntime; renderViews?: (cameras: CameraId[]) => Promise<ViewsResult> };
  }
}

export function App() {
  const onReady = useCallback((scene: SceneHandle) => {
    let disposed = false;
    let stopFrames: (() => void) | null = null;
    void createRuntime(createDefaultWorld(SEED), scene, MODULES).then((runtime) => {
      if (disposed) return;
      const renderViews = getRenderViews();
      window.__tomato = renderViews ? { runtime, renderViews } : { runtime };
      stopFrames = scene.onFrame((dt) => runtime.step(dt));
    });
    return () => {
      disposed = true;
      stopFrames?.();
    };
  }, []);

  return (
    <main className="h-full w-full grid grid-cols-[55fr_45fr]">
      <section className="relative h-full">
        <SpectatorView onReady={onReady} />
        <div className="absolute left-3 top-3 text-xs uppercase tracking-widest text-neutral-400">Vue spectateur</div>
      </section>
      <aside className="overflow-auto border-l border-neutral-800 p-4 text-sm text-neutral-400">
        <PerceptionBadge />
        <AgentViews />
      </aside>
    </main>
  );
}
```

- [ ] **Step 5: Vérifier dans le navigateur**

Run: `npm run dev:sim` puis ouvrir http://localhost:5173.
Expected: en haut du panneau de droite, trois pastilles ; en moins de 3 s la première passe de « contours Sobel (OpenCV.js en chargement) » à « contours Canny + CLAHE » ; la deuxième affiche « YOLOv8 ONNX + HSV » si `tomato-ripe.onnx` est présent, sinon « HSV seul (YOLO absent) » et la console montre `[perception] YOLO désactivé (modèle absent) : détecteur HSV seul` ; la troisième se met à jour deux fois par seconde sim. Cliquer « Rafraîchir les vues » : les contours des vues sont des traits blancs fins d'un pixel (Canny), plus nets et sans halo que Sobel. Dans la console : `window.__tomato.runtime.apply({ type: 'ripen_next' })` puis, quelques secondes plus tard, `window.__tomato.runtime.onEvent(console.log)` a reçu `{ type: 'ripe_detected', tomatoId, detector: 'yolo' | 'hsv', confidence }` et la pastille affiche des boîtes. Aucune erreur console (les deux avertissements Vite « Module "fs" has been externalized » n'apparaissent qu'au build et sont attendus).

- [ ] **Step 6: Lint, typecheck, build**

Run: `npm run lint && npm run typecheck && npm run build`
Expected: exit 0. Le build affiche trois avertissements `Module "fs"|"path"|"crypto" has been externalized for browser compatibility, imported by …/opencv.js` et un avertissement de taille de chunk (`opencv-….js` ≈ 11,3 Mo, `ort-wasm-simd-threaded-….wasm` ≈ 14,2 Mo copié en asset) : attendus, pas d'erreur.

- [ ] **Step 7: Commit**

```bash
git add packages/sim/src/perception/yoloDetector.ts packages/sim/src/perception/perceptionModule.ts packages/sim/src/perception/PerceptionBadge.tsx packages/sim/src/App.tsx
git commit -m "feat(perception): YOLO ONNX via onnxruntime-web, module branché dans MODULES, pastille de perception"
```

---

### Task 10: Test Playwright de la perception (`perception.spec.ts`)

**Files:**
- Create: `packages/sim/tests/perception.spec.ts`

**Interfaces:**
- Consumes: `window.__tomato` (runtime, `renderViews`) et `window.__tomatoPerception` ; écrit `data/shots/view-front-canny.png`, `data/shots/perception.json`, `data/shots/perception.png`.

- [ ] **Step 1: Écrire `tests/perception.spec.ts`**

```ts
import { expect, test } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const shotsDir = resolve(import.meta.dirname, '../../../data/shots');
const RIPEN_ATTEMPTS = 3;
const WAKE_TIMEOUT_MS = 15_000;

test('perception: Canny edges once OpenCV is loaded, detector badge, wake-up on a ripe tomato', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/');
  await page.waitForFunction(() => window.__tomato?.renderViews !== undefined);
  await page.waitForFunction(() => window.__tomatoPerception?.state().opencvReady === true, null, { timeout: 30_000 });

  const png = await page.evaluate(async () => (await window.__tomato!.renderViews!(['front'])).images[0]!.pngBase64);
  mkdirSync(shotsDir, { recursive: true });
  writeFileSync(resolve(shotsDir, 'view-front-canny.png'), Buffer.from(png, 'base64'));
  await expect(page.getByTestId('perception-badge')).toContainText('Canny');

  // Réveil : mûrir des tomates jusqu'à ce que l'une soit vue par la caméra front (M1 requis ; sinon ripen_next échoue et on saute).
  await page.evaluate(() => {
    window.__tomato!.runtime.onEvent((e) => {
      if (e.type === 'ripe_detected') window.__tomatoPerception!.events.push(e);
    });
  });
  let ripenOk = false;
  for (let attempt = 0; attempt < RIPEN_ATTEMPTS; attempt++) {
    const result = await page.evaluate(() => window.__tomato!.runtime.apply({ type: 'ripen_next' }));
    if (!result.ok) break;
    ripenOk = true;
    const woke = await page
      .waitForFunction(() => window.__tomatoPerception!.events.length > 0, null, { timeout: WAKE_TIMEOUT_MS })
      .then(() => true, () => false);
    if (woke) break;
  }
  const state = await page.evaluate(() => ({ ...window.__tomatoPerception!.state(), events: window.__tomatoPerception!.events }));
  writeFileSync(resolve(shotsDir, 'perception.json'), JSON.stringify({ ripenOk, ...state }, null, 2));
  await page.screenshot({ path: resolve(shotsDir, 'perception.png') });
  if (ripenOk) {
    expect(state.events[0]).toMatchObject({ type: 'ripe_detected', tomatoId: expect.any(Number) });
    expect(['hsv', 'yolo']).toContain(state.lastDetector);
  }
  expect(errors).toEqual([]);
});
```

- [ ] **Step 2: Lancer le test**

Run: `npm run shot -w @tomato/sim -- tests/perception.spec.ts`
Expected: `1 passed` en ≈ 20 s ; `data/shots/view-front-canny.png` (vue front, fond sombre, contours Canny blancs fins), `data/shots/perception.png` (page avec les pastilles), `data/shots/perception.json` avec `"ripenOk": true`, `"opencvReady": true`, `"events": [{ "type": "ripe_detected", "tomatoId": <n>, "detector": "yolo" | "hsv", "confidence": … }]` et `"yoloReady": true` si le modèle est présent. Si aucun réveil n'arrive après trois `ripen_next` (toutes les tomates mûries cachées dans la vue front), lancer une seconde fois : le plant est régénéré à chaque chargement avec la même graine, le résultat est déterministe ; noter la graine dans `plan_deviations` si le cas se produit.

- [ ] **Step 3: Commit**

```bash
git add packages/sim/tests/perception.spec.ts
git commit -m "test(perception): Playwright — Canny actif, pastille, réveil ripe_detected sur ripen_next, captures"
```

---

### Task 11: Gates, captures, checklist et PR

**Files:**
- Modify: `docs/superpowers/specs/2026-09-17-etape-3-m4-perception-checklist.md` (cocher)
- Create: `data/build_verdict.json`

- [ ] **Step 1: Gates complets**

Run:
```bash
npm run lint && npm run typecheck && npm test && npm run build && npm run shot
```
Expected: les cinq commandes sortent en 0 ; Vitest rapporte les 44 tests de `packages/sim/src/perception/*.test.ts` en plus des tests existants ; `data/shots/` contient `scene.png`, `view-top.png`, `view-front.png`, `view-side.png` (M3), `view-front-canny.png`, `perception.png`, `perception.json` (M4).

- [ ] **Step 2: Cocher la checklist**

Cocher chaque `[SPEC-N]`, `[TEST-N]`, `[GATE-N]` de `docs/superpowers/specs/2026-09-17-etape-3-m4-perception-checklist.md` avec la sortie fraîche sous les yeux. Un item non réalisable → ne pas cocher, rendre `failed` avec `items_skipped` (exception documentée : `[SPEC-2]` accepte « modèle non exporté » avec la raison dans `plan_deviations`, car YOLO est optionnel par la spec).

```bash
git add docs/superpowers/specs/2026-09-17-etape-3-m4-perception-checklist.md
git commit -m "docs(perception): checklist M4 cochée"
```

- [ ] **Step 3: PR**

```bash
git push -u origin feat/4-m4-perception
gh pr create --base main --title "feat(perception): Canny + CLAHE, YOLO ONNX avec repli HSV, détecteur de réveil (M4)" --body "Closes #4

Checklist: docs/superpowers/specs/2026-09-17-etape-3-m4-perception-checklist.md
Plan: docs/superpowers/plans/2026-09-17-etape-3-m4-perception.md

## Gates
lint: pass · typecheck: pass · test: pass · build: pass · shot: pass (data/shots/view-front-canny.png, perception.png, perception.json)

🤖 Generated with [Claude Code](https://claude.com/claude-code)"
gh issue edit 4 --remove-label todo --remove-label in-progress --add-label in-review
```

Puis écrire `data/build_verdict.json` selon `.claude/agents/builder.md` (`status: "pr_created"`, numéro de PR, branche, `items_skipped: []`, `plan_deviations` réelles — dont « YOLO non exporté » le cas échéant —, gates).

---

## Auto-revue du plan

**Couverture de la spec 4.4 :**
1. Contours : gris → CLAHE → Canny 50/150 via OpenCV.js WASM, composés en blanc sur le rendu assombri — `cannyClaheRgba` + `createCannyClaheFilter` (Task 6) branchés par `setEdgeFilter` (Task 8) dans le pipeline M3 qui assombrit à 35 % et compose ; Sobel reste actif tant qu'OpenCV n'est pas chargé (`currentEdgeFilter = sobelEdges`).
2. Détecteur : YOLOv8n ripe/unripe en ONNX exécuté par onnxruntime-web sur la vue `front` à 640 px à 2 Hz sim — `loadYoloDetector` (Task 9), `letterbox`/`decodeYolo`/`nms` (Task 4), `captureFront(ctx)` = `renderCameraImage(ctx.scene, 'front')` réduit à `DETECTOR_INPUT_PX` (Tasks 8-9), `PERCEPTION_PERIOD_S = 0.5` (Task 7). Repli HSV si ONNX indisponible ou score < 0,4 — `detect()` de Task 7 avec `YOLO_ACCEPT_SCORE_MIN`, `hsvDetector` (masque rouge, ouverture morphologique, aire minimale, Task 3). Le dashboard sait quel détecteur a déclenché — `detector` de l'événement, `perceptionState().lastDetector`, `PerceptionBadge`.
3. Réveil : N frames consécutives (défaut 5) — `createWakeGate` (Task 5) ; vérité terrain confirmée et désactivable — `groundTruthGuard` (Task 7) ; message `ripe_detected` (spec 3, étape 2) — `ctx.emitEvent`, une fois par tomate jusqu'à `new_plant` (signal `plant_regenerated`).
Contrat Étape 3 : `perceptionModule` nommé `perception` après `cameraModule` ✓ ; `createCannyClaheFilter(cv) → EdgeFilter` ✓ ; `setEdgeFilter` ajouté à `renderViews.ts` ✓ ; `RipeDetector`/`Detection` ✓ (union `Detection[] | Promise<Detection[]>` justifiée par l'API asynchrone d'onnxruntime-web) ; `hsvDetector`, `yoloDetector` (modèle `public/models/tomato-ripe.onnx`, journalisé s'il manque) ✓ ; `matchDetections(detections, tomatoes, project) → { tomatoId, score }[]` ✓ (`distancePx` en plus) ; `createWakeGate(n = 5) → { push }` ✓ (`reset` en plus) ; `perceptionState()` ✓ (`subscribePerception` en plus pour éviter le polling de M7). Spec 8 : tout ce qui est calcul est testé en Node sans DOM ni WASM ; Playwright couvre le navigateur. Spec 10 : YOLO strictement optionnel.

**Scan des placeholders :** aucun `TODO`, aucun « similaire à », aucun code tronqué ; chaque fichier de la structure a son contenu complet dans une tâche ; les deux fichiers de M3 modifiés sont donnés en instructions locales plus le résultat complet attendu.

**Cohérence des types :** `RgbaImage` est un sur-type structurel d'`ImageData` (`renderCameraImage` renvoie `ImageData`, `resizeRgba` le consomme) ; les tableaux passés à `new ImageData` sont typés `Uint8ClampedArray<ArrayBuffer>` (TS 5.9) ; `Detection.bbox` est un tuple readonly, `unletterbox` et `decodeYolo` construisent des tuples ; `matchDetections` accepte `Tomato[]` du store via `TomatoRef` ; `frontProjector` réutilise `projectToPixel('front', pose, p)` de M3 et le facteur `sizePx / VIEW_SIZE_PX` ; `DetectorKind` et `SimEvent` viennent de `@tomato/shared` sans modification ; `CvApi` est vérifié assignable depuis le vrai `cv` par `tsc` ; `exactOptionalPropertyTypes` respecté (`options?` fusionné par spread, `details` absents des événements).

**Validation faite par le rédacteur :** l'intégralité des fichiers de ce plan a été extraite dans une copie de `packages/sim` (avec M3 assemblé depuis son plan et son worktree, puis M1 depuis son worktree) : `tsc --noEmit` 0 erreur, `eslint` 0 erreur, Vitest 150 tests verts dont les 44 de M4, `vite build` en 5 s, et `tests/perception.spec.ts` vert en 20 s avec `ripe_detected { tomatoId: 3, detector: 'yolo', confidence: 0.458 }` dans `perception.json` et des contours Canny visibles dans `view-front-canny.png`.

**Points d'attention à l'exécution :** (1) `cv.createCLAHE` n'existe pas à l'exécution : utiliser `new cv.CLAHE(...)` comme écrit ; (2) `wasmPaths` doit rester en forme objet `{ wasm: url }` ; (3) YOLO reconnaît les tomates rendues avec un score ≈ 0,46, juste au-dessus du seuil 0,4 : le détecteur peut alterner entre `yolo` et `hsv` d'un tick à l'autre, ce qui est conforme à la spec et sans effet sur le réveil (même identifiant) ; si le réveil n'arrive jamais sur une tomate visible, baisser `YOLO_ACCEPT_SCORE_MIN` n'est pas la bonne piste, vérifier d'abord la capture (point StrictMode des Global Constraints) ; (4) `MIN_BLOB_AREA_PX = 80` et les seuils HSV sont calibrés sur le pixel rendu (127, 22, 13) ; une tomate mûre très occultée (< 80 px rouges à 640) n'est pas détectée, ce qui est le comportement voulu ; (5) `prefer-const` est actif : pas de `let` jamais réassigné ; (6) le premier tick attend que `captureFront` renvoie une image, donc rien ne se passe en Node ni avant que la scène existe.
