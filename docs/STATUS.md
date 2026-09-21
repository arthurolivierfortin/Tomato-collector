# STATUS

**Étape courante :** S:4 — Intégration et tournage, vidéo v3 livrée (`data/video/tomato-demo-v3.mp4`, 7 min 08 s, runner visible PR #45, prises v3 PR #47) ; montage v3.1 en cours (sous-titres recalés, vignette dès le réveil). Issue ouverte restante : #35 étiquettes.
**Repo :** arthurolivierfortin/Tomato-collector

## Étapes

| Étape | Modules | État |
|---|---|---|
| S:1 Fondations | monorepo, shared, scène minimale, plant v1, README, cycle, issues | terminée 2026-09-17 |
| S:2 Sim | M1 plant (PR #10), M2 bras (PR #8), M3 vues (PR #9) | terminée 2026-09-17 |
| S:3 Perception, serveur, agent, dashboard | M4 (PR #13), M5 (PR #17), M6 (PR #16), M7 (PR #15) | terminée 2026-09-18 |
| S:4 Intégration et tournage | premiers épisodes réels, ajustements, prises vidéo | vidéo v3 livrée (PR #45, #47) ; montage v3.1 en cours |

## Conditions de passage

- S:1 → S:2 : gates verts, capture `data/shots/scene.png` approuvée par le propriétaire, contrats de `shared` mergés.
- S:2 → S:3 : PR M1, M2, M3 mergées ; `get_views` local produit trois PNG conformes validés par le visual-checker.
- S:3 → S:4 : un épisode scripté de bout en bout (sans Claude) passe en intégration ; le dashboard affiche la trace et les vues.
- Fin : au moins un épisode `harvested` enregistré en vidéo avec la trace lisible, et un épisode de replay disponible.

## Journal

- 2026-09-17 : spec approuvée, plan de l'Étape 1 écrit, Étape 1 en cours.
- 2026-09-17 : Étape 1 terminée, capture approuvée par le propriétaire. Étape 2 lancée : builders M1, M2, M3 en parallèle.
- 2026-09-17 : M2 (PR #8) mergé après judge + visual-checker approuvés.
- 2026-09-17 : M1 (PR #10) mergé après correction (StrictMode retiré, pédoncules 7–9 cm, croissance ×1,2). Plans M4–M7 de l'Étape 3 écrits et liés aux issues.
- 2026-09-17 : M3 (PR #9) mergé après correction et vérification visuelle finale 12/12 avec tomates. Étape 2 terminée (224 tests). Étape 3 lancée : builders M4, M5, M6, M7 en parallèle.
- 2026-09-17 : M4, M5, M7 mergés (368 tests). Intégration réelle serveur + page + appel MCP vérifiée. M6 en finalisation avec premier épisode Claude réel.
- 2026-09-18 : M6 (PR #16) mergé. Premier épisode réel de Claude : harvested, 10 tool calls, 0 erreur, 0,355 $, 61 s. Étape 3 terminée (412 tests). Étape 4 lancée.
- 2026-09-18 : PR #24 mergée (#21) : mouvements animés en temps sim (ciseaux/panier 15 cm/s, rotations 45°/s, caméras 20 cm/s, lames 0,5 s), outil MCP répondant à la fin du mouvement, `TOMATO_TOOL_PACING_MS` (1500 ms). 455 tests.
- 2026-09-18 : PR #25 mergée (#23 A+B) : une seule tomate mûrit à la fois (première à 3 s, suivante 4 s après coupe ou chute), messages `agent_raw` et `agent_wake` ajoutés au contrat, séquence perception → serveur → agent dans le schéma bloc. 477 tests. Reste #23 partie C (dashboard).
- 2026-09-18 : PR #26 mergée (#22) : diagnostic des vues grises (vignettes 274 px, caméras jamais reçues peintes en gris, un seul message de vues par épisode) ; fusion par caméra, état « en attente » et âge, vue mise en avant 613 px + vignettes, trace JSON (base64 masqué, 3 derniers dépliés, chrono de l'appel en cours), loupe plein écran touche z. 511 tests. Issue #27 ouverte (CORS /health et /episodes), à traiter avec #23 partie C.
- 2026-09-18 : PR #28 mergée (#23 partie C, #27) : panneau « Session agent (brut) » touche t, réveil mis en évidence (ligne de trace + bandeau 3,5 s), maturité de la tomate dans le bandeau de statuts, schéma bloc allumé en séquence perception → serveur → agent (1,2 s), CORS sur /health et /episodes. 538 tests. Issue #29 ouverte (réveil manuel avec agent off), en cours.
- 2026-09-18 : PR #30 mergée (#29) : le serveur de réveil démarre aussi avec `TOMATO_AGENT=off` ; un réveil manuel met alors en scène détection → réveil (blocs, phase `detected`, `agent_wake` manual) sans requête au SDK ; `npm run wake` rend la main. 547 tests. En cours : captures de vérification de main, série d'épisodes réels, pipeline vidéo (`scripts/video/`).
- 2026-09-18 : Série de 5 épisodes réels : 5/5 récoltés, 58 appels, 0 erreur, 2,52 $ (`docs/episodes-2026-09-18.md`). PR #32 mergée : angles de lames suggérés par le serveur dans `get_views`/`move_camera`, prompt (formule fermée, `rotate_scissors` après `move_basket`), coût journalisé à l'arrêt ; épisode de validation : silence après le premier `get_views` 6,8 s (contre 15–48 s), coupe à 0°. 562 tests.
- 2026-09-18 : PR #33 mergée (#31 finitions tournage) : phase de session recopiée dans la sim et gravée dans les vues, mode v refait (vue 804 px + deux de 383 px, contrôles repliables), pose de repos du bras à droite du plant (`robot/restPose.ts`, 50 graines sans collision), favicon, marge du schéma bloc. 574 tests. `main` = état de tournage. En cours : PR #34 pipeline vidéo (`scripts/video/`).
- 2026-09-18 : PR #34 mergée : pipeline d'enregistrement et de montage (`scripts/video/`, Chromium headless GPU 1920×1080 25 img/s, ffmpeg cartons/arrêts sur image/sous-titres, 657 tests). Première vidéo `data/video/tomato-demo.mp4` (5 min 04 s) : partie 2 en direct réussie (épisode `2026-09-18T16-36-29-196Z-t1`, récoltée, 12 appels, 61 s, 0,38 $) ; partie 1 à refaire en direct (PR de suivi en cours).
- 2026-09-18 : PR #37 mergée : vidéo en anglais sans tiret long, partie 1 tournée en direct (scénario piloté par les états réels), sous-titres redessinés, terminal filmé depuis la sortie réelle du serveur (`TOMATO_LOG_STREAM`/`TOMATO_LOG_FILE`, page terminal headless), carton honnête, segment pipeline conditionnel (touche x, PR #38). 715 tests.
- 2026-09-18 : PR #38 mergée (#36 perception honnête) : garde de vérité terrain retirée du chemin de réveil, modèle YOLOv8n fine-tuné sur 400 rendus (jeux train/eval/contrôle disjoints ; contrôle 60 plants jamais vus : ripe précision 0,963 / rappel 1,000, mAP50 0,989 ; HSV 0,743 / 0,816), modèle seul décideur, inférence wasm SIMD multithread dans un Web Worker (COOP/COEP), latence mûre → détectée 2,5–6 s, panneau Perception (p), mode Pipeline de traitement (x), `docs/perception-model.md`. 777 tests.
- 2026-09-19 : PR #39 mergée (recalage du plan vidéo). Vidéo v2 `data/video/tomato-demo-v2.mp4` (6 min 09 s, anglais) : partie 1 en direct (épisode `2026-09-18T20-14-09-255Z-t1`, 0,38 $) avec panneau Perception, segment pipeline de 76 s, terminal en demi-écran ; partie 2 cycle complet (épisode `2026-09-18T20-16-54-341Z-t1`, récoltée, 12 appels, 61 s, 0,30 $) avec terminal en vignette. Montage v2.1 en cours (tuiles du pipeline agrandies).
- 2026-09-19 : PR #40 mergée : montage v2.1 `data/video/tomato-demo-v2.1.mp4` (6 min 17 s, anglais, sans tiret long) : détection filmée avant/pendant/après avec panneau Perception agrandi (prise gratuite), tuiles du pipeline agrandies avec Input / Done by / Output, vérification des vues par l'agent avant la coupe, terminal en demi-écran puis vignette, aucune seconde répétée ; test `visibleLabels.test.ts` interdisant les tirets longs dans les libellés visibles. 806 tests. Vidéo livrée au propriétaire ; coût total des épisodes de la session ≈ 3,9 $.
- 2026-09-19 : PR #41 mergée : montage v2.2 `data/video/tomato-demo-v2.2.mp4` (6 min 14 s) : segment détection en écran partagé continu (tomate qui rougit à gauche, vue du modèle agrandie en direct à droite : 8 unripe → première boîte ripe → porte 5/5 → réveil), `lib/split.ts`. 826 tests. Aucun épisode payant.
- 2026-09-21 : PR #43 mergée : cartons titre « Tomato Collector, By Arthur-Olivier Fortin » en ouverture et fin (v2.3).
- 2026-09-21 : PR #44 mergée (#42) : caméra spectateur tournée vers l'avant (`spectatorFraming.ts`, cadrage large + touche k coupe), lames en maillage 3D, caméra outil embarquée en incrustation (touche j), vues de l'agent inchangées au pixel près. 869 tests.
- 2026-09-21 : PR #45 mergée : runner `TOMATO_AGENT=visible` (Claude Code headless dans une vraie fenêtre Windows Terminal, flux stream-json filmé) ; PR #47 mergée : prises v3 (concepts et cycle avec runner visible, détection et pipeline gratuites, nouvelle caméra + caméra outil), vidéo `data/video/tomato-demo-v3.mp4` (7 min 08 s). Montage v3.1 en cours (sous-titres recalés, vignette dès le réveil).
