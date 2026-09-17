# Étape 2 — M3 Caméras orthographiques et couche d'annotation des vues — Checklist

Issue : #3 · Plan : `docs/superpowers/plans/2026-09-17-etape-2-m3-vues.md` · Contrat : `docs/superpowers/plans/2026-09-17-etape-2-architecture.md` · Spec : sections 4.3, 4.5, 5, 6, 8.

Tout le code M3 est dans `packages/sim/src/cameras/` ; hors de ce dossier, seuls `packages/sim/src/App.tsx` (MODULES, declare global, `window.__tomato.renderViews`, `<AgentViews />`) et `packages/sim/tests/views.spec.ts` sont touchés. `packages/shared` n'est pas modifié.

## Code
- [ ] [SPEC-1] Bases des caméras (top −Z, front +Y, side −X), lacet autour de Z monde puis tangage autour de l'axe droite, `projectToPixel` pur (800×800, py vers le bas, `pxPerCm = 800 / widthCm`), `imageAxes`, plan de grille par le point visé — `packages/sim/src/cameras/ortho.ts`
- [ ] [SPEC-2] Espacement de grille automatique ∈ {1, 2, 5, 10, 20} cm, au plus 16 lignes par côté — `packages/sim/src/cameras/gridSpacing.ts`
- [ ] [SPEC-3] Lignes de grille des deux axes monde de l'image, dans le plan visé, projetées (correctes en pivot) ; barre d'échelle 5/10/20 cm — `packages/sim/src/cameras/gridLines.ts`
- [ ] [SPEC-4] Fraction de visibilité = pixels comptés ÷ π(r·pxPerCm)², bornée à [0, 1] ; couleurs d'identifiants bijectives 1..255 ; comptage par identifiant — `packages/sim/src/cameras/visibility.ts`
- [ ] [SPEC-5] Retournement des lignes du render target et conversion linéaire → sRGB ; noyau Sobel, assombrissement, composition — `packages/sim/src/cameras/pixels.ts`, `edgesCore.ts`
- [ ] [SPEC-6] Palette de la spec (rouge/orange/vert, cyan tige, magenta axe lame, blanc-bleu normale, jaune panier, blanc contours, grille 25 %, gris axes), police ≥ 13 px ; commandes d'overlay typées — `packages/sim/src/cameras/palette.ts`, `overlayTypes.ts`
- [ ] [SPEC-7] Géométrie du schéma des ciseaux calculée localement (lames 6 cm, pivot = point de coupe − axe·3, pointes à ±ouverture/2 autour de la normale, bouts d'axes à 8 cm) — `packages/sim/src/cameras/scissorsGeometry.ts`
- [ ] [SPEC-8] Couche 2 : grille, axes monde marqués, valeurs en cm dans les marges, `X →` / `Z ↑`, barre d'échelle en bas à gauche — `packages/sim/src/cameras/layerGrid.ts`
- [ ] [SPEC-9] Couche 3 : cercle numéroté par tomate, couleur d'état, XYZ en cm, badge « occultée » si `visibleIn[cam] < 0,5`, anneau cyan sur la cible — `packages/sim/src/cameras/layerMarkers.ts`
- [ ] [SPEC-10] Couche 4 : tige cible cyan (`stem.fromCm` → `stem.toCm`) ; ciseaux (pivot, deux lames, croix du point de coupe, axe lame magenta et normale blanc-bleu, lacet/tangage/roulis/ouverture en texte) ; panier (fond et bord projetés, arêtes, centre en croix) ; verticale de chute pointillée jusqu'au plan du fond du panier avec impact prédit (même X, Y) — `packages/sim/src/cameras/layerTools.ts`
- [ ] [SPEC-11] Couche 5 : bandeau haut avec nom de la vue, axes visibles, position et angles de la caméra, px/cm, espacement et plan de grille, temps sim, mention PIVOTÉE — `packages/sim/src/cameras/layerHeader.ts` ; assemblage des couches — `annotations.ts`
- [ ] [SPEC-12] JSON des vues (`ViewsPayload` de `@tomato/shared`) construit depuis le store : sim time, phase, cible, tomates (état, ripeness, position, stem, visibleIn), ciseaux, panier, caméras, limites — `packages/sim/src/cameras/payload.ts`
- [ ] [SPEC-13] Action `move_camera` : déplacement relatif clampé aux rails (`fail('out_of_rail', …, { axis, requestedCm, minCm, maxCm })`), lacet/tangage bornés à ±`cameraPivotDeg`, zoom > 0 divisant `widthCm` dans [20, 200] cm, `pxPerCm` recalculé, jamais de `throw` — `packages/sim/src/cameras/cameraState.ts`
- [ ] [SPEC-14] Trois `OrthographicCamera` + `WebGLRenderTarget` 800×800 + `CameraHelper` dans la scène spectateur ; `poseCamera` par la base monde convertie avec `worldToThree` ; lecture du render target en `ImageData` — `packages/sim/src/cameras/agentCameras.ts`
- [ ] [SPEC-15] Passe d'identifiants : matériau plat par tomate (couleur en linéaire), occulteurs noirs conservant `map`/`alphaTest`/`side`, non-Mesh masqués, fond noir, scène restaurée — `packages/sim/src/cameras/idPass.ts`
- [ ] [SPEC-16] Interface `EdgeFilter = (img: ImageData) => ImageData` avec Sobel par défaut, `darken`, `compose` — `packages/sim/src/cameras/edges.ts`
- [ ] [SPEC-17] Dessin des commandes sur canvas 2D avec halo sombre sous chaque texte — `packages/sim/src/cameras/drawOverlay.ts`
- [ ] [SPEC-18] Pipeline `renderViews(cameras)` : passe d'identifiants → `store.tomatoes[i].visibleIn` → payload → rendu → assombri 35 % → contours → annotations → PNG base64 sans préfixe `data:` ; renvoie `ViewsResult` — `packages/sim/src/cameras/renderViews.ts`
- [ ] [SPEC-19] `cameraModule: SimModule` ('cameras') : `init` crée caméras/targets/helpers et `renderViews` quand la scène existe, `update` re-pose les caméras depuis `store.cameras`, `handle('move_camera')` ; `getRenderViews`, `subscribeViews` — `packages/sim/src/cameras/cameraModule.ts`
- [ ] [SPEC-20] Composant `AgentViews` (trois dernières vues, nom de caméra, bouton « Rafraîchir les vues ») dans l'`aside` ; `cameraModule` dans `MODULES` ; `window.__tomato = { runtime, renderViews }` — `packages/sim/src/cameras/AgentViews.tsx`, `packages/sim/src/App.tsx`

## Tests
- [ ] [TEST-1] `packages/sim/src/cameras/ortho.test.ts` — point à 10 cm à droite → px = 400 + 10·pxPerCm ; point plus haut → py plus petit ; top : +Y vers le haut ; lacet 90° sur front : +X devient profondeur ; base orthonormée ; plan de grille
- [ ] [TEST-2] `packages/sim/src/cameras/gridSpacing.test.ts` — 8 px/cm → 10 cm, 16 → 5, 4 → 20, 40 → 2, 80 → 1 ; jamais plus de 16 lignes
- [ ] [TEST-3] `packages/sim/src/cameras/gridLines.test.ts` — lignes X verticales à px = 400 + X·8, lignes Z horizontales, alignées monde en tangage ; barre d'échelle 20/10/5 cm
- [ ] [TEST-4] `packages/sim/src/cameras/visibility.test.ts` — fraction bornée ; bijection 1..255 ; comptage par identifiant
- [ ] [TEST-5] `packages/sim/src/cameras/pixels.test.ts`, `edgesCore.test.ts` — retournement des lignes, LUT sRGB, Sobel sur une marche, seuil, assombrissement, composition
- [ ] [TEST-7] `packages/sim/src/cameras/annotations.test.ts` (`scissorsPoints`) — pivot à 3 cm derrière le point de coupe, pointes à 6 cm écartées par l'ouverture
- [ ] [TEST-8] `packages/sim/src/cameras/annotations.test.ts` — grille, étiquettes d'axes et barre d'échelle présentes
- [ ] [TEST-9] `packages/sim/src/cameras/annotations.test.ts` — deux marqueurs (couleurs d'état, XYZ) ; badge « occultée » dans la vue où `visibleIn < 0,5` et pas ailleurs
- [ ] [TEST-10] `packages/sim/src/cameras/annotations.test.ts` — tige cible cyan de `fromCm` à `toCm` ; schéma des ciseaux (deux lames, pivot, croix, deux axes de couleurs différentes, texte des angles) ; panier (deux rectangles, centre) ; verticale de chute jusqu'au z du fond du panier ; rien de spécifique sans cible
- [ ] [TEST-11] `packages/sim/src/cameras/annotations.test.ts` — bandeau (VUE FRONT, axes, pose caméra, px/cm, temps sim, PIVOTÉE) ; textes ≥ 13 px avec halo
- [ ] [TEST-12] `packages/sim/src/cameras/payload.test.ts` — payload copie l'état ; `TomatoView` sans rayon
- [ ] [TEST-13] `packages/sim/src/cameras/cameraState.test.ts` — translation ; `out_of_rail` avec détails ; pivot borné ; zoom et bornes ; zoom invalide ; cumul relatif
- [ ] [TEST-19] `packages/sim/src/cameras/cameraModule.test.ts` — `handle` écrit le store, ignore les autres actions, `getRenderViews()` null sans scène
- [ ] [TEST-20] `packages/sim/tests/views.spec.ts` (Playwright) — `renderViews(['top','front','side'])` → trois images 800×800 PNG base64 sans préfixe, JSON avec les trois caméras et autant de tomates que le store, `visibleIn` > 0 quelque part quand des tomates existent, `data/shots/view-*.png` écrits, bouton « Rafraîchir les vues » affiche une image

## Gates
- [ ] [GATE-1] npm run lint
- [ ] [GATE-2] npm run typecheck
- [ ] [GATE-3] npm test
- [ ] [GATE-4] npm run build
- [ ] [GATE-5] npm run shot → `data/shots/scene.png`, `view-top.png`, `view-front.png`, `view-side.png` produits

## Critères visuels (visual-checker, sur `data/shots/view-top.png`, `view-front.png`, `view-side.png` et `scene.png`)
- [ ] [VIS-1] Couche 1 — fond : rendu assombri (pas noir uniforme, pas l'image claire d'origine) avec contours blancs du plant, des tomates, des ciseaux et du panier
- [ ] [VIS-2] Couche 2 — grille : lignes fines régulières sur toute l'image, 8 à 16 par côté, axes monde (valeur 0) légèrement plus marqués ; valeurs en cm lisibles dans la marge basse (axe horizontal) et la marge gauche (axe vertical) ; étiquettes `X →` (`Y →` sur side) en bas à droite et `Z ↑` (`Y ↑` sur top) en haut à gauche ; barre d'échelle en bas à gauche avec sa longueur en cm
- [ ] [VIS-3] Couche 3 — marqueurs : un cercle numéroté par tomate, centré sur le fruit, vert/orange/rouge selon l'état ; étiquette `#id état (x, y, z)` à côté ; badge « occultée NN % » sur les tomates cachées par une feuille dans cette vue seulement ; anneau cyan sur la cible (si M1 mergé ; sinon aucune tomate et aucun marqueur, ce qui est attendu)
- [ ] [VIS-4] Couche 4 — tige cible : trait cyan court entre la branche et le fruit cible, avec le texte « tige cible » (si cible)
- [ ] [VIS-5] Couche 4 — ciseaux : pivot en point magenta, deux lames en traits magenta, croix magenta au point de coupe, axe « lame » en magenta et « normale » en blanc-bleu clairement distincts, texte « ciseaux lacet … tangage … roulis … ouverture … »
- [ ] [VIS-6] Couche 4 — panier : rectangle jaune du fond et du bord (un rectangle en top, une boîte vue de côté en front/side), croix jaune au centre, texte « panier (x, y) z=… »
- [ ] [VIS-7] Couche 4 — verticale de chute : pointillé blanc du fruit cible vers le bas (vertical en front/side, réduit à un point en top) se terminant par un cercle jaune et le texte « impact (x, y) » (si cible)
- [ ] [VIS-8] Couche 5 — bandeau : bande sombre en haut avec « VUE TOP/FRONT/SIDE », les axes de l'image, la position caméra en cm, lacet et tangage, « px/cm », l'espacement de grille et le temps sim ; « PIVOTÉE » seulement si la caméra a pivoté
- [ ] [VIS-9] Orientation : sur front et side le plant est debout (sol en bas, Z croissant vers le haut) ; sur top, X croît vers la droite et Y vers le haut ; les coordonnées des étiquettes concordent avec la position des objets sur la grille
- [ ] [VIS-10] Lisibilité : tout texte ≥ 13 px avec halo sombre, lisible à 100 % sur un PNG de 800 px ; magenta, jaune et cyan se distinguent des contours blancs
- [ ] [VIS-11] Scène spectateur (`scene.png`) : les trois frustums des caméras (`CameraHelper`) sont dessinés autour du plant, sans casser la scène de l'Étape 1
- [ ] [VIS-12] Dashboard : le panneau de droite affiche les trois vues côte à côte avec le nom de la caméra et le bouton « Rafraîchir les vues »
