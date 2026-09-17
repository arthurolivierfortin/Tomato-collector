# STATUS

**Étape courante :** S:2 — Sim (M1 plant, M2 bras, M3 vues en parallèle)
**Repo :** arthurolivierfortin/Tomato-collector

## Étapes

| Étape | Modules | État |
|---|---|---|
| S:1 Fondations | monorepo, shared, scène minimale, plant v1, README, cycle, issues | terminée 2026-09-17 |
| S:2 Sim | M1 plant complet, M2 bras et outils, M3 caméras et annotations | en cours |
| S:3 Perception, serveur, agent, dashboard | M4, M5, M6, M7 | à faire |
| S:4 Intégration et tournage | — | à faire |

## Conditions de passage

- S:1 → S:2 : gates verts, capture `data/shots/scene.png` approuvée par le propriétaire, contrats de `shared` mergés.
- S:2 → S:3 : PR M1, M2, M3 mergées ; `get_views` local produit trois PNG conformes validés par le visual-checker.
- S:3 → S:4 : un épisode scripté de bout en bout (sans Claude) passe en intégration ; le dashboard affiche la trace et les vues.
- Fin : au moins un épisode `harvested` enregistré en vidéo avec la trace lisible, et un épisode de replay disponible.

## Journal

- 2026-09-17 : spec approuvée, plan de l'Étape 1 écrit, Étape 1 en cours.
- 2026-09-17 : Étape 1 terminée, capture approuvée par le propriétaire. Étape 2 lancée : builders M1, M2, M3 en parallèle.
