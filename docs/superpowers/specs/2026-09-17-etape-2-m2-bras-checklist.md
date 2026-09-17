# Étape 2 — M2 Bras 5 axes, ciseaux, règles de coupe, collision, panier sur rail — Checklist

Issue #2. Plan : `docs/superpowers/plans/2026-09-17-etape-2-m2-bras.md`. Contrat : `docs/superpowers/plans/2026-09-17-etape-2-architecture.md`.
Périmètre des fichiers : `packages/sim/src/robot/**`, une ligne dans `packages/sim/src/App.tsx`, `packages/sim/tests/robot.spec.ts`. Aucun fichier dans `packages/shared/`.

## Code
- [x] [SPEC-1] Rotations 3×3 `rotX/rotY/rotZ`, `composeZYX` = Rz·Ry·Rx, Rodrigues, `orientationVectors` depuis `bladeAxis = [-1,0,0]`, `bladeNormal = [0,0,1]`, `transverse = bladeNormal × bladeAxis` — `packages/sim/src/robot/rotation.ts`
- [x] [SPEC-2] Géométrie des ciseaux : lames de 6 cm, `pivot = cutPoint − bladeAxis·3`, pointes à ±ouverture/2 autour de `bladeNormal` ; `poseFromAngles` remplit `bladeAxis`/`bladeNormal` — `packages/sim/src/robot/scissorsGeometry.ts`
- [x] [SPEC-3] Distances point-segment et segment-segment, angle entre directions dans [0, 90] — `packages/sim/src/robot/geometry.ts`
- [x] [SPEC-4] Règle de coupe pure : cible = `targetId` ou pédoncule le plus proche ; `stem_cut` si distance ≤ 0,6 cm et angle(tige, `bladeNormal`) < 45° ; sinon `misaligned` (≤ 3 cm) avec distance et angle ; `leaf_cut` si feuille à moins de 3 cm et aucune tige ; `nothing_between_blades` sinon — `packages/sim/src/robot/cutRule.ts`
- [x] [SPEC-5] Portée : distance à la base ≤ `scissorsReachCm` et z ≥ 5 cm — `packages/sim/src/robot/reach.ts`
- [ ] [SPEC-6] Collision du trajet rectiligne du point de coupe : refusé à moins de `radiusCm + 0,5` d'une tomate ou de `stemRadiusCm + 0,5` de la tige principale, avec la position bloquante ; feuilles et pédoncules traversables ; un départ déjà dans la marge peut s'éloigner — `packages/sim/src/robot/collision.ts`
- [ ] [SPEC-7] IK analytique : épaule à 20 cm, bras 55, avant-bras 55 ; lacet de base = atan2 XY, deux maillons planaires coude en haut ; `null` hors portée ; cinématique directe — `packages/sim/src/robot/ik.ts`
- [ ] [SPEC-8] Réducteurs purs `moveScissors` (`out_of_reach` avec distance/portée/z min, `collision` avec `atX/atY/atZ`), `rotateScissors` (angles ramenés dans [-180, 180)), `openScissors` (60°), `closeAndCut` (`stem_cut` ferme les lames ; erreurs `misaligned`/`leaf_cut`/`nothing_between_blades` avec `details` en cm et degrés), `moveBasket` (`out_of_rail` avec le rail) ; jamais de `throw`, état inchangé sur échec — `packages/sim/src/robot/robotState.ts`
- [ ] [SPEC-9] Maillages Three.js : bras (base, colonne, bras, avant-bras, articulations, deux lames qui s'ouvrent avec `openingDeg`) gris neutre `#9ca3af` et lames magenta `#e879f9` ; panier boîte ouverte 20×20×10 jaune `#facc15` ; conversion via `worldToThree` uniquement — `packages/sim/src/robot/buildArmMesh.ts`, `packages/sim/src/robot/buildBasketMesh.ts`
- [ ] [SPEC-10] `robotModule` (`SimModule`, `name: 'robot'`) : `init` ajoute les maillages si `ctx.scene` non nul ; `update` pose le bras par IK sur le pivot des ciseaux et le panier depuis `store.scissors`/`store.basket` ; `handle` route `move_scissors`, `rotate_scissors`, `open_scissors`, `cut`, `move_basket`, écrit le store sur succès, émet `signals 'tomato_cut' { tomatoId }` sur `stem_cut`, renvoie `null` sinon ; obstacles = tomates attachées du store + tige principale et feuilles de `ctx.registry.plantSpec` — `packages/sim/src/robot/robotModule.ts`
- [ ] [SPEC-11] `robotModule` ajouté à `MODULES` dans `packages/sim/src/App.tsx` (après `plantModule` s'il est présent, sinon premier élément) ; aucune autre modification de `App.tsx`

## Tests
- [x] [TEST-1] `packages/sim/src/robot/rotation.test.ts` — `elementary rotations`, `orientationVectors` (yaw 90 → `[0,-1,0]`, pitch vers +Z, roll sans effet sur l'axe, vecteurs unitaires orthogonaux)
- [x] [TEST-2] `packages/sim/src/robot/scissorsGeometry.test.ts` — `scissorsPoints` (pivot/pointes fermés et ouverts à 60°), `poseFromAngles`
- [x] [TEST-3] `packages/sim/src/robot/geometry.test.ts` — `distancePointSegment`, `distanceSegmentSegment`, `angleBetweenDeg`
- [x] [TEST-4] `packages/sim/src/robot/cutRule.test.ts` — `evaluateCut` : `stem_cut` (0 cm, 0,5 cm, 44°), `misaligned` (1,5 cm ; 90° ; 46°), respect de `targetId`, `leaf_cut`, `nothing_between_blades`, distance infinie sans tige
- [x] [TEST-5] `packages/sim/src/robot/reach.test.ts` — `isReachable` (dans/hors sphère, z < 5)
- [ ] [TEST-6] `packages/sim/src/robot/collision.test.ts` — `pathBlocked` : tomate traversée avec `id` et `atCm`, marge 0,5, tige principale sans `id`, départ dans la marge (s'éloigner accepté, s'approcher refusé), premier obstacle le long du trajet
- [ ] [TEST-7] `packages/sim/src/robot/ik.test.ts` — `solveIk / forwardKinematics` : aller-retour sur cinq poignets, `null` hors portée et à l'épaule, bras tendu à 110 cm, lacet 180° vers le plant, longueurs des maillons et coude en haut
- [ ] [TEST-8] `packages/sim/src/robot/robotState.test.ts` — `moveScissors` (absolu/relatif, `out_of_reach` avec `distanceCm`, `invalid_argument`, `collision` tomate et tige), `rotateScissors` (relatif, absolu partiel, wrap, `invalid_argument`), `openScissors / closeAndCut` (lames fermées, `stem_cut`, `misaligned` avec `details`, tomates détachées ignorées, `leaf_cut`, `nothing_between_blades`), `moveBasket` (absolu/relatif, `out_of_rail` avec le rail)
- [ ] [TEST-10] `packages/sim/src/robot/robotModule.test.ts` — `robotModule` : actions étrangères → `null`, store écrit sur succès et intact sur échec, `tomato_cut` émis une fois sur `stem_cut` et jamais sur échec, tige et feuilles lues dans `registry.plantSpec`
- [ ] [TEST-11] `packages/sim/tests/robot.spec.ts` — capture Playwright `data/shots/robot.png` après `open_scissors`, `move_scissors`, `rotate_scissors`, `move_basket` réussis via `window.__tomato.runtime`

## Gates
- [ ] [GATE-1] npm run lint
- [ ] [GATE-2] npm run typecheck
- [ ] [GATE-3] npm test
- [ ] [GATE-4] npm run build
- [ ] [GATE-5] npm run shot → `data/shots/scene.png` et `data/shots/robot.png`

## Critères visuels (visual-checker, sur `data/shots/scene.png` et `data/shots/robot.png`)
- Bras articulé visible, gris neutre, parti d'une base cylindrique posée au sol en +X / −Y du plant (à droite et devant, `[70, -40, 0]`), avec une colonne, deux maillons et des articulations sphériques ; rien de noir, rien de flottant sans lien avec la base.
- Ciseaux au bout du bras : deux lames magenta (`#e879f9`) bien distinctes du vert du plant et du gris du bras ; dans `robot.png` elles sont ouvertes (deux lames écartées en V) et placées près du plant, à droite de la tige, sans traverser une tomate.
- Panier jaune (`#facc15`), boîte ouverte 20×20 cm de 10 cm de haut, posé sous le plant ; dans `scene.png` centré au pied du plant, dans `robot.png` décalé vers +X sous les tomates.
- Plant toujours visible avec feuilles et tomates, ombres au sol, rien hors champ.
