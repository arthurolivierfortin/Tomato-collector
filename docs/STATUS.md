# STATUS

**Étape courante :** S:4 — Intégration et tournage
**Repo :** arthurolivierfortin/Tomato-collector

## Étapes

| Étape | Modules | État |
|---|---|---|
| S:1 Fondations | monorepo, shared, scène minimale, plant v1, README, cycle, issues | terminée 2026-09-17 |
| S:2 Sim | M1 plant (PR #10), M2 bras (PR #8), M3 vues (PR #9) | terminée 2026-09-17 |
| S:3 Perception, serveur, agent, dashboard | M4 (PR #13), M5 (PR #17), M6 (PR #16), M7 (PR #15) | terminée 2026-09-18 |
| S:4 Intégration et tournage | premiers épisodes réels, ajustements, prises vidéo | en cours |

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
