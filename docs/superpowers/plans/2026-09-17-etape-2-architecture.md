# Étape 2 — Architecture interne de `packages/sim` (contrat entre M1, M2, M3)

Ce document fixe ce que les trois modules de l'Étape 2 partagent. Les plans M1, M2, M3 et leurs builders s'y conforment ; un module qui a besoin d'autre chose le dit dans sa checklist au lieu de le prendre.

## Socle déjà en place (Étape 1, `packages/sim/src/core/`)

- `store.ts` : `createWorldStore(initial)` → `{ get, set, update(fn), subscribe(fn) }`. `WorldState` de `@tomato/shared` est l'unique vérité géométrique côté sim ; immuable, chaque `update` produit un nouvel objet.
- `module.ts` : `SimModule { name; init(ctx); update?(dtSimS, ctx); handle?(action, ctx): ActionResult | null }` et `SimContext { store; signals; emitEvent(SimEvent); scene: SceneHandle | null; registry: { plantSpec: PlantSpec | null } }`. `scene` est `null` dans les tests Node.
- `signals.ts` : signaux internes entre modules : `{ type: 'tomato_cut'; tomatoId }`, `{ type: 'plant_regenerated'; seed }`. `ctx.signals.emit(...)`, `ctx.signals.on(type, fn)`.
- `dispatch.ts` : `applyAction(modules, action, ctx)` → premier module dont `handle` ne renvoie pas `null`, sinon `fail(..., 'not_available')`.
- `clock.ts` : module horloge (`set_time_scale`, `set_paused`, `set_target`) ; `update` reçoit le dt réel et publie le dt sim.
- `runtime.ts` : `createRuntime(initialWorld, scene, modules)` → `{ ctx, apply(action), step(dtRealS), onEvent(fn) }`. `App.tsx` crée le runtime avec la liste `MODULES` et expose `window.__tomato = { runtime }`.
- `three/createScene.ts` : `SceneHandle { scene, renderer, camera, controls, addObject, onFrame(cb), dispose }`. 1 unité Three = 1 cm ; conversion unique `three/frame.ts` (`worldToThree`, `threeToWorld`).
- `plant/generatePlant.ts` : `PlantSpec { seed, mainStem: Vec3[], stemRadiusCm, branches, leaves, tomatoes: TomatoSpec[] }`, `TomatoSpec { id, anchorCm, centerCm, radiusCm, ripenAtS }`, `LeafSpec { positionCm, normal, sizeCm, spinDeg }`. `plant/buildPlantMesh.ts` : `buildPlantMesh(spec): Group` (tomates nommées `tomato-<id>`, `userData.tomatoId`), `tomatoColor(ripeness)`.

## Répartition des dossiers (un module = un dossier, aucun fichier ailleurs)

| Module | Dossier | Ordre dans `MODULES` |
|---|---|---|
| M1 plant | `packages/sim/src/plant/` | 1 |
| M2 robot | `packages/sim/src/robot/` | 2 |
| M3 cameras | `packages/sim/src/cameras/` | 3 |

Chaque module exporte un `SimModule` (`plantModule`, `robotModule`, `cameraModule`) et l'ajoute à `MODULES` dans `App.tsx` (seule ligne de `App.tsx` que le module touche, plus le remplacement du plant statique par M1). M3 ajoute aussi un composant `AgentViews` dans l'`aside` de `App.tsx`.

## Contrats entre modules

### Store `WorldState` (qui écrit quoi)

- **M1 écrit** `tomatoes[]` (positions, `ripeness`, `state`, `radiusCm`, `stem`, `attached`, et met à jour `positionCm` d'une tomate en chute) et `seed`. `stem.fromCm` = point d'attache sur la branche (`anchorCm`), `stem.toCm` = point sur la surface du fruit (`centerCm − dir · radiusCm`, `dir` = direction anchor → centre).
- **M2 écrit** `scissors` et `basket`.
- **M3 écrit** `cameras` et `tomatoes[i].visibleIn` (uniquement ce champ).
- `phase` n'est pas géré par la sim (le serveur, M5, en est la source de vérité) ; il reste `idle` côté sim.

### Registry et signaux

- M1 publie `ctx.registry.plantSpec` à `init` et à chaque `new_plant`, puis émet `signals 'plant_regenerated'`.
- M2, sur `cut` réussi, émet `signals 'tomato_cut' { tomatoId }`. M1 écoute et libère la tomate (corps Rapier dynamique, `attached = false`).
- M1 émet vers le serveur `ctx.emitEvent({ type: 'tomato_landed', tomatoId, inBasket })` et `{ type: 'plant_regenerated', seed }`. `ripe_detected` est émis par M4 (perception), pas par M1.

### Actions (`SimAction`) prises en charge

| Action | Module |
|---|---|
| `ripen_next`, `new_plant` | M1 |
| `move_scissors`, `rotate_scissors`, `open_scissors`, `cut`, `move_basket` | M2 |
| `move_camera` | M3 |
| `set_time_scale`, `set_paused`, `set_target` | clock (déjà fait) |

Toute erreur = `fail(state, code, message, details)` de `@tomato/shared`, jamais `throw`. Les détails numériques (distance, angle, position bloquante) sont en cm et degrés.

### Cible de la coupe

`store.targetTomatoId` (posé par `set_target`, le serveur le fera en M5). Si `null`, M2 prend la tomate dont le pédoncule est le plus proche du point de coupe. M2 lit les pédoncules dans `store.tomatoes[].stem` et les feuilles dans `ctx.registry.plantSpec.leaves`.

## Conventions géométriques

- Repère monde : X droite, Y arrière, Z haut, cm, origine au pied du plant. Angles en degrés.
- **Ciseaux (M2)** : orientation de base (lacet = tangage = roulis = 0) → `bladeAxis = [-1, 0, 0]` (les lames pointent vers le plant depuis la base du bras en +X), `bladeNormal = [0, 0, 1]` (plan des lames horizontal). Orientation = `Rz(lacet) · Ry(tangage) · Rx(roulis)` appliquée aux vecteurs de base ; `transverse = bladeNormal × bladeAxis`. Lames de 6 cm ; pivot = `cutPoint − bladeAxis · 3` ; pointes = pivot + rotation de `bladeAxis` de ±ouverture/2 autour de `bladeNormal`, longueur 6. Tolérance de coupe 0,6 cm ; condition d'angle : angle entre la tige et `bladeNormal` < 45° (⇔ la tige traverse le plan des lames). Résultats de `cut` : `stem_cut` ; sinon `misaligned` (distance ≤ 3 cm) avec `distanceCm` et `angleDeg` ; `leaf_cut` si une feuille est à moins de 3 cm du point de coupe et aucune tige ; `nothing_between_blades` sinon.
- **Bras (M2)** : base `limits.scissorsBaseCm`, épaule à 20 cm de hauteur, bras 55 cm, avant-bras 55 cm (portée 110 = `limits.scissorsReachCm`), poignet = pivot des ciseaux. IK analytique : lacet de base = atan2 dans XY, deux maillons planaires, poignet pour l'orientation. Représentation seulement : cylindres/boîtes, pas de collision du bras.
- **Collision (M2)** : le trajet rectiligne du point de coupe est refusé s'il passe à moins de `radiusCm + 0,5` d'une tomate ou à moins de `stemRadiusCm + 0,5` de la tige principale ; les feuilles et les pédoncules sont traversables.
- **Panier (M2)** : rail `limits.basketRailCm`, hauteur fixe `basket.centerCm[2]` = 5 (fond), profondeur 10, 20×20.
- **Chute (M1)** : Rapier (`@dimforge/rapier3d-compat`, gravité −981 cm/s² sur l'axe Three Y). Tomate attachée = corps cinématique suivant la sim ; coupée = dynamique. Règle d'atterrissage pure `landingOutcome(posCm, radiusCm, basket)` : `in_basket` si XY dans le rectangle et Z entre le fond et fond + profondeur + rayon ; `floor` si Z ≤ rayon + 0,5 hors panier ; sinon `airborne`. Décision au repos (vitesse < 2 cm/s) ou après 3 s sim.
- **Mûrissement (M1)** : `ripeness = clamp((t − (ripenAtS − 15)) / 15)` ; `state` : < 0,35 `unripe`, < 0,9 `turning`, sinon `ripe` ; rayon × (1 + 0,3 · ripeness) ; couleur `tomatoColor`. `ripen_next` : la prochaine tomate non mûre attachée reçoit `ripenAtS = simTimeS` (mûre en 0 s, `ripeness` = 1 immédiatement).
- **Caméras (M3)** : orthographiques. `top` regarde −Z (image : X → droite, Y → haut), `front` regarde +Y (X → droite, Z → haut), `side` regarde −X (Y → droite, Z → haut). Pivot lacet/tangage ≤ `limits.cameraPivotDeg`. `widthCm` = largeur du champ ; `zoom` multiplie `widthCm` par `1/zoom` ; `pxPerCm = 800 / widthCm`. Render targets 800×800. `projectToPixel(camId, pose, pointCm) → [px, py]` pure et testée. Grille : lignes des axes monde dans le plan passant par le point visé, projetées (donc correctes même pivotées) ; espacement `chooseSpacing(pxPerCm)` ∈ {1, 2, 5, 10, 20} cm pour 8 à 16 lignes par côté.
- **Vues annotées (M3)** : pipeline `renderViews(cameras)` → pour chaque caméra : rendu RT → `ImageData` → assombrissement à 35 % → contours (interface `EdgeFilter = (img: ImageData) => ImageData`, défaut Sobel en TypeScript ; M4 fournira Canny + CLAHE via OpenCV.js) → couches d'annotation (grille, axes, échelle, marqueurs, tige cible cyan, schéma ciseaux magenta avec ses deux axes en deux couleurs, panier jaune, verticale de chute pointillée, bandeau) → PNG base64. Renvoie `ViewsResult` de `@tomato/shared`. Exposé par `window.__tomato.renderViews`. `visibleIn` : passe de rendu d'identifiants (chaque tomate en couleur plate unique) et comptage des pixels ÷ aire attendue `π (r · pxPerCm)²`, borné à 1.
- Palette : rouge mûr `#c8261b`, orange `#e08a1e`, vert `#3f9a3a`, cyan tige `#22d3ee`, magenta ciseaux `#e879f9` (axe lame) et blanc-bleu `#93c5fd` (normale), jaune panier `#facc15`, contours blancs `#ffffff`, grille `rgba(255,255,255,0.25)`, axes `#9ca3af`.

## Tests attendus par module

- Pures, sous Vitest Node, sans DOM : mûrissement, atterrissage (M1) ; rotations, géométrie des ciseaux, règle de coupe, portée, collision, IK aller-retour (M2) ; projection, espacement de grille, fraction de visibilité, calcul des points des schémas (M3).
- Les parties Three.js / Rapier / canvas ne sont pas testées en Node : elles sont couvertes par Playwright (`npm run shot` produit `data/shots/scene.png` et, pour M3, `data/shots/view-top.png`, `view-front.png`, `view-side.png`) et par le visual-checker.
- Un module ne modifie pas `packages/shared`. S'il le doit, il l'écrit dans sa checklist en item `[SPEC-N]` explicite et le builder s'arrête en `blocked` pour validation.

## Vérification de fin d'étape

`get_views` local : dans la page, `await window.__tomato.renderViews(['top','front','side'])` renvoie trois PNG conformes à la section 4.5 de la spec, avec ciseaux et panier dessinés, sur un plant où au moins une tomate est mûre (`ripen_next`). Le test Playwright `packages/sim/tests/views.spec.ts` (M3) fait exactement cela et écrit les captures.
