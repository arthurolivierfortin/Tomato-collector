# Étape 2 — M1 Plant complet — Checklist

Issue #1. Plan : `docs/superpowers/plans/2026-09-17-etape-2-m1-plant.md`. Contrat : `docs/superpowers/plans/2026-09-17-etape-2-architecture.md`. Tous les fichiers du module sont dans `packages/sim/src/plant/` ; seules exceptions autorisées : `packages/sim/package.json` (dépendance), `packages/sim/src/App.tsx` (ligne `MODULES` et retrait du plant statique), `packages/sim/tests/scene.spec.ts` (attente du plant asynchrone). `packages/shared` n'est pas modifié.

## Code
- [ ] [SPEC-1] Mûrissement pur : `ripenessAt` = clamp((t − (ripenAtS − 15)) / 15), `stateFromRipeness` (< 0,35 unripe, < 0,9 turning, sinon ripe), `radiusScale` = 1 + 0,3·ripeness — `packages/sim/src/plant/ripening.ts`
- [ ] [SPEC-2] Règle d'atterrissage pure `landingOutcome(posCm, radiusCm, basket)` → `in_basket` / `floor` / `airborne` et critère `shouldDecide` (repos < 2 cm/s après 0,25 s, ou 3 s) — `packages/sim/src/plant/landing.ts`
- [ ] [SPEC-3] Tomates du store depuis la spec : `stem.fromCm = anchorCm`, `stem.toCm = centerCm − dir·radiusCm`, `attached = true`, `visibleIn` initialisé et jamais écrasé ensuite ; `nextToRipen` = prochaine attachée non mûre — `packages/sim/src/plant/plantState.ts`
- [ ] [SPEC-4] Interface `PlantPhysics` (`attach`, `release`, `clear`, `step`, `positionOf`, `speedOf`, `setBasket`, `dispose`) et faux moteur analytique pour les tests — `packages/sim/src/plant/physics.ts`, `fakePhysics.ts`
- [ ] [SPEC-5] `plantModule` (`name: 'plant'`) : à `init`, `ctx.registry.plantSpec = generatePlant(store.seed)` et `store.tomatoes` rempli ; à chaque `update(dt > 0)` les attachées mûrissent (`ripeness`, `state`, `radiusCm`) et la vue est synchronisée ; `ripen_next` rend mûre immédiatement la prochaine attachée non mûre et renvoie `fail(..., 'not_available')` s'il n'en reste pas ; `new_plant` régénère (graine `action.seed` ou suivante), remet `targetTomatoId` à `null`, publie le registry, émet le signal et l'événement `plant_regenerated` — `packages/sim/src/plant/plantModule.ts`
- [ ] [SPEC-6] Chute : sur signal `tomato_cut`, la tomate passe `attached = false`, son corps devient dynamique, sa `positionCm` suit la physique dans le store et la vue ; décision par `landingOutcome` au repos ou après 3 s ; `ctx.emitEvent({ type: 'tomato_landed', tomatoId, inBasket })` émis exactement une fois par tomate coupée ; `new_plant` oublie les chutes en cours ; un signal pour une tomate inconnue ou déjà coupée est ignoré — `packages/sim/src/plant/falling.ts`, `plantModule.ts`
- [ ] [SPEC-7] Plant v2 : `BranchSpec.midCm` et `branchPoint` (Bézier quadratique, contrôle au-dessus de la corde), 3–5 nœuds de feuilles par branche avec 2–3 folioles chacun (`leaves ≥ 6 × branches`), ancres des tomates sur la branche courbe, maturités `order·20 + 10` ; invariants v1 conservés (hauteur 60–80, 3–5 branches, 4–8 tomates, pédoncule 4–6 cm, inclinaison 0–60°, feuilles 8–14 cm) — `packages/sim/src/plant/generatePlant.ts`
- [ ] [SPEC-8] Maillage v2 (branches en tubes Bézier, pédoncules nommés `pedicel-<id>`, tomates `tomato-<id>`) et vue `createPlantView` : couleur `tomatoColor(ripeness)`, échelle `radiusCm / rayon de la spec`, position monde → Three, pédoncule caché après la coupe, groupe remplacé sur `new_plant` — `packages/sim/src/plant/buildPlantMesh.ts`, `plantView.ts`, `view.ts`
- [ ] [SPEC-9] Physique Rapier (`@dimforge/rapier3d-compat`, chargé par `import()` dynamique, jamais importé par un test Node) : gravité `{ 0, −981, 0 }` sur Y Three, sol collider, tomates cinématiques (`RigidBodyDesc.kinematicPositionBased`) devenant dynamiques à `release` (`setBodyType(Dynamic)`), panier = corps cinématique avec fond, quatre parois et capteur `setSensor(true)`, repositionné à chaque frame depuis `store.basket` ; pas fixe 1/120 s avec accumulateur borné — `packages/sim/src/plant/rapierPhysics.ts`, `packages/sim/package.json`
- [ ] [SPEC-10] `App.tsx` : `MODULES = [plantModule]`, plant statique (`buildPlantMesh(generatePlant(SEED))`) retiré ; `scene.spec.ts` attend `registry.plantSpec`, applique `ripen_next` via `window.__tomato.runtime` et vérifie qu'une tomate est `ripe` avant la capture — `packages/sim/src/App.tsx`, `packages/sim/tests/scene.spec.ts`

## Tests
- [ ] [TEST-1] `packages/sim/src/plant/ripening.test.ts` :: `ripenessAt`, `stateFromRipeness`, `radiusScale` (4 tests)
- [ ] [TEST-2] `packages/sim/src/plant/landing.test.ts` :: `landingOutcome` (in_basket, airborne au-dessus/sous le fond, floor, airborne en chute), `shouldDecide` (repos après délai minimal, timeout 3 s) (6 tests)
- [ ] [TEST-3] `packages/sim/src/plant/plantState.test.ts` :: `stemOf`, `tomatoesFromSpec` (t = 0 et mûre ×1.3), `ripenTomato` (préserve visibleIn/position), `nextToRipen` (6 tests)
- [ ] [TEST-4] `packages/sim/src/plant/fakePhysics.test.ts` :: attachée immobile, chute au sol, chute sur le fond du panier, clear (4 tests)
- [ ] [TEST-5] `packages/sim/src/plant/plantModule.test.ts` :: `plantModule init` (spec publiée, store rempli), `plantModule ripening` (turning à mi-rampe, ripe ×1.3, pause et visibleIn préservé), `plantModule actions` (ripen_next puis not_available, new_plant avec et sans graine, actions étrangères → null) (7 tests)
- [ ] [TEST-6] `packages/sim/src/plant/falling.test.ts` :: in_basket une seule fois, floor, pas de décision à la frame de coupe et refus de double release, timeout 3 s, tomate disparue et reset (5 tests) ; `plantModule.test.ts` :: `plantModule cut and landing` (in_basket sous le panier, floor, coupe inconnue/double ignorée, new_plant oublie la chute) (4 tests)
- [ ] [TEST-7] `packages/sim/src/plant/generatePlant.test.ts` :: les 4 tests v1 inchangés + `generatePlant v2` (branches courbes, ancres sur la courbe, densité ≥ 6 folioles par branche, maturités échelonnées à partir de 10 s) (8 tests)
- [ ] [TEST-8] `packages/sim/tests/scene.spec.ts` :: `spectator scene renders the plant module and is captured` (Playwright : plant chargé, `ripen_next` ok, une tomate `ripe`, aucune erreur de page, `data/shots/scene.png`)

## Gates
- [ ] [GATE-1] `npm run lint`
- [ ] [GATE-2] `npm run typecheck`
- [ ] [GATE-3] `npm test` (72 tests : shared 18, sim 53, server 1)
- [ ] [GATE-4] `npm run build`
- [ ] [GATE-5] `npm run shot` → `data/shots/scene.png` produite et conforme aux critères visuels ci-dessous

## Critères visuels (visual-checker, `data/shots/scene.png`)
- Plant entier visible dans la vue spectateur, au centre, sur le sol gris avec grille ; rien de noir ni de vide, ombres portées au sol.
- Plant nettement plus dense qu'en Étape 1 : branches arquées (pas des segments droits), feuilles groupées par 2–3 le long des branches, au moins une dizaine de feuilles visibles.
- 4 à 8 tomates suspendues sous les branches par de courts pédoncules.
- Les tomates ne sont pas toutes de la même couleur : au moins une rouge (`ripen_next` appliqué par la capture), au moins une orangée ou vert-orangé (première tomate en transition), le reste vert.
- La tomate rouge est visiblement plus grosse que les vertes (rayon ×1.3).
- Aucune tomate au sol, aucun objet flottant hors du plant (aucune coupe n'est faite pendant la capture).
