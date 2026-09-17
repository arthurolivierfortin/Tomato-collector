# Démo « récolte de tomates par un agent LLM » — Design

**Date :** 2026-09-17
**Statut :** approuvé en brainstorm, en attente de relecture de la spec
**Format de livraison :** vidéo enregistrée, tournée sur le laptop de développement (Windows 11, RTX A1000 6 Go, 32 Go RAM)

## 1. Objectif

Démontrer qu'un LLM, bon avec le texte, peut accomplir une tâche robotique complexe si on lui donne (a) des outils via un serveur MCP et (b) des vues formatées pour être analysables comme du texte : trois vues 2D orthogonales, contrastées, avec grille, axes, échelle et schémas des outils. Le cas : un plant de tomates simulé dont les fruits mûrissent ; un détecteur réveille l'agent quand une tomate est mûre ; l'agent positionne trois caméras, des ciseaux et un panier, coupe la tige, et la tomate tombe (ou non) dans le panier. Un dashboard montre en direct la simulation, ce que l'agent voit, ses actions, un schéma bloc animé et les statuts.

### Portée (in)

- Simulation 3D dans le navigateur : plant procédural avec mûrissement en temps accéléré, feuilles occultantes, physique de chute.
- Bras 5 axes de représentation (IK analytique) portant des ciseaux ; panier sur rail XY ; trois caméras orthographiques sur rails orthogonaux avec pivot limité.
- Perception : détecteur « tomate mûre » (YOLOv8 ripe/unripe en ONNX, fallback HSV), contours Canny + CLAHE, couche d'annotation.
- Serveur Node : MCP streamable HTTP, hub WebSocket, bus d'événements, journal des épisodes, runner d'agent (Claude Agent SDK TypeScript).
- Dashboard : vue spectateur 3D, trois vues annotées, trace de l'agent, bandeau de statuts, schéma bloc animé, contrôles de tournage, replay.
- README de développement, adaptation du cycle de développement de Marcel (agents et skills dans `.claude/`).

### Portée (out, YAGNI explicite)

- Pas de vrai robot, pas de ROS, pas d'export vers un contrôleur physique.
- Pas de photoréalisme, pas de CAD détaillé du bras (représentation seulement).
- Pas de base de données, pas d'authentification, pas de déploiement cloud.
- Pas de multi-plant ni de navigation dans une serre : un plant, un poste de travail.
- Pas de détection de tige par modèle appris : la tige vient de la vérité terrain de la sim.
- Pas de mode live public : la robustesse vise le tournage, pas une présentation en direct.

### Contraintes

- Deadline courte : le développement est découpé en étapes parallélisables, avec une liste de coupes ordonnée (section 10).
- Windows 11 sans toolchain native : uniquement Node 22, npm, TypeScript, WASM. Pas de compilation C++.
- L'agent tourne en headless via le Claude Agent SDK (auth Claude Code de la machine), modèle Opus 5 par défaut, configurable.
- Unités partout : centimètres et degrés. Repère monde : X vers la droite, Y vers l'arrière (profondeur), Z vers le haut, origine au pied du plant.

## 2. Décisions de conception

| Sujet | Décision | Raison |
|---|---|---|
| Moteur | Three.js + Rapier (WASM) dans le navigateur | Zéro friction Windows, rendu propre, physique suffisante pour « chute dans le panier », le dashboard est la même page. MuJoCo écarté (deux langues, vue 3D interactive à recoder). Genesis, PyBullet, Isaac, Gazebo écartés (Windows ou matériel). |
| Mécanique | Ciseaux commandés en XYZ + lacet, tangage, roulis (5 axes utiles + ouverture), affichés par un bras articulé de représentation avec IK analytique | Les tiges ne sont pas verticales, il faut orienter la lame ; l'agent raisonne en XYZ, jamais en angles articulaires. |
| Caméras agent | Trois caméras **orthographiques** | Un cm = le même nombre de pixels quelle que soit la profondeur : l'échelle est valable pour la tomate, les ciseaux et le panier en même temps. L'agent ne convertit rien. |
| Vue spectateur | Perspective, orbitable | Naturelle à l'œil, non destinée à l'agent. |
| Représentation des outils dans les vues | Schémas en lignes (ciseaux : pivot, deux lames, point de coupe, repère local ; panier : rectangle, centre, verticale de chute) | L'agent lit des limites et des angles, pas un rendu. |
| Détecteur | YOLOv8n ripe/unripe (ONNX, onnxruntime-web) avec fallback HSV | Montre un « modèle » dans la démo ; HSV garantit le réveil même si YOLO rate le rendu synthétique. |
| Agent | Claude Agent SDK TS, session persistante reprise à chaque épisode, MCP en HTTP | Streaming natif des événements, mémoire entre épisodes, MCP utilisable aussi depuis Claude Code interactif pour piloter à la main pendant le dev. |
| Plant | Procédural en code, régénérable, module isolé | Remplaçable par un glTF libre si le rendu déplaît, sans toucher au reste. |
| Cycle de dev | Version allégée du `/cycle` de Marcel : spec + checklist comme contrat, builders TDD en parallèle dans des worktrees, judge indépendant, visual-checker, cleaner | Garde la discipline qui évite les PR « done but not done », coupe les étapes inutiles pour une démo. |

## 3. Architecture

Monorepo npm workspaces, TypeScript strict, ESLint, Vitest, Playwright.

```
packages/
  shared/    types et contrats (état du monde, messages WS, schémas outils, format des vues)
  sim/       page navigateur : scène Three.js, Rapier, plant, bras, caméras, perception, annotations, dashboard React
  server/    process Node : MCP streamable HTTP, hub WS, bus d'événements, journal, runner d'agent
docs/        specs, plans, README de dev
.claude/     agents et skills du cycle adapté
```

**Flux d'un épisode.**

1. La sim fait mûrir une tomate (temps accéléré, facteur configurable).
2. La perception la détecte comme mûre sur N frames consécutives (N configurable, défaut 5) → message `ripe_detected` au serveur.
3. Le serveur passe en phase `detected`, réveille l'agent (nouvelle session au premier épisode, reprise ensuite) avec un événement structuré.
4. L'agent appelle `get_views`, reçoit trois PNG annotés + JSON, raisonne, enchaîne `move_basket`, `move_camera`, `move_scissors`, `rotate_scissors`, `get_views`, `cut`.
5. Après `cut` réussi, Rapier fait tomber la tomate ; un capteur dans le panier décide `harvested` ou `missed` dans un délai de 3 s sim.
6. L'agent appelle `report` ; le serveur archive la trace de l'épisode en JSON et repasse en `idle`.
7. Chaque message (événement sim, tool call, texte agent, changement de phase) est diffusé au dashboard.

**Transport.** Le navigateur ouvre un WebSocket vers le serveur. Le serveur envoie des commandes (`apply_action`, `render_views`) et reçoit l'état et les événements. Le serveur est la source de vérité de la phase et du journal ; le navigateur est la source de vérité de la géométrie. Une seule page « sim » (celle qui possède la géométrie) est connectée à la fois ; des pages supplémentaires en lecture seule (dashboard sans sim) sont tolérées. Une reconnexion recharge l'état complet.

**Phases du système :** `idle`, `detected`, `harvesting`, `cutting`, `falling`, `harvested`, `missed`, `aborted`. Les transitions sont dans `shared` et testées.

## 4. Simulation (`packages/sim`)

### 4.1 Scène et plant

- Sol de serre, fond neutre, éclairage directionnel avec ombres douces, lumière d'environnement, antialiasing.
- Plant procédural paramétré par une graine : tige principale segmentée, 3 à 5 branches, feuilles en plans double face à texture alpha (occultantes), 4 à 8 tomates sur des pédoncules courts orientés aléatoirement (inclinaison 0 à 60° par rapport à la verticale). Bouton « nouveau plant » régénère avec une autre graine.
- Mûrissement : chaque tomate a un instant de maturité ; couleur (vert → orange → rouge) et rayon (×1.0 → ×1.3) interpolés sur le temps sim. État `unripe`, `turning`, `ripe`.
- Physique Rapier : chaque tomate est un corps rigide fixé à son pédoncule par une contrainte ; `cut` retire la contrainte ; le panier est un composé de colliders avec un capteur volumique ; le sol est un collider. Un contact tomate-sol hors capteur donne `missed`.

### 4.2 Bras, ciseaux, panier

- Bras de représentation : base rotative, épaule, coude, poignet (tangage, roulis). IK analytique : rotation de base = atan2 sur XY, deux maillons planaires pour atteindre la distance et la hauteur, poignet pour l'orientation demandée. Limites de portée exposées dans `get_status` et dans les erreurs des outils.
- Ciseaux : pivot, deux lames de longueur L, angle d'ouverture. Point de coupe = milieu entre les pointes lorsque fermés. Repère local : axe lame (direction de coupe), normale au plan des lames, axe transversal.
- Règle de coupe (pure, testée) : `cut` réussit si la distance du segment de coupe à la tige cible est inférieure à la tolérance (défaut 0.6 cm) et si l'angle entre la ligne de coupe et la tige est supérieur à 45°. Sinon retour `nothing_between_blades`, `leaf_cut` (si une feuille est dans les lames) ou `misaligned` avec la distance et l'angle mesurés.
- Collision : un déplacement des ciseaux dont le trajet traverse une tomate ou la tige principale est refusé avec `collision` et la position bloquante ; les feuilles sont traversables (elles plient).
- Panier : rectangle de 20×20 cm, profondeur 10 cm, sur rail XY sous le plant, hauteur fixe.

### 4.3 Caméras de l'agent

| Caméra | Regarde vers | Axes dans l'image | Rails |
|---|---|---|---|
| top | −Z | X horizontal, Y vertical | X, Y, Z (hauteur) |
| front | +Y | X horizontal, Z vertical | X, Z, Y (recul) |
| side | −X | Y horizontal, Z vertical | Y, Z, X (recul) |

- Projection orthographique ; largeur de champ ajustable (zoom) ; pivot lacet et tangage limités à ±25° pour contourner une feuille. Quand une caméra pivote, le bandeau l'indique et la grille reste calée sur les axes monde projetés.
- Rendu dans des render targets 800×800, lus en PNG.

### 4.4 Perception

- Contours : conversion en niveaux de gris, CLAHE, Canny (seuils 50/150) via OpenCV.js (WASM). Composé en blanc sur le rendu assombri.
- Détecteur mûr : YOLOv8n ripe/unripe exporté en ONNX (poids libres identifiés en recherche), exécuté par onnxruntime-web sur la vue `front` à 640 px, à 2 Hz sim. Fallback HSV (masque rouge, ouverture morphologique, aire minimale) si ONNX indisponible ou score sous 0.4. Le dashboard affiche quel détecteur a déclenché.
- Réveil : une tomate est déclarée mûre quand le détecteur la voit `ripe` sur N frames consécutives et que la vérité terrain confirme (garde-fou de démo : évite un faux réveil pendant le tournage ; désactivable).

### 4.5 Couche d'annotation (contrat des vues)

Chaque `get_views` renvoie, pour chaque caméra demandée, un PNG 800×800 composé dans l'ordre :

1. Fond : rendu assombri à 35 % + contours Canny en blanc.
2. Grille en cm calée sur les axes monde projetés, espacement automatique (1, 2, 5 ou 10 cm selon le zoom) pour garder 8 à 16 lignes par côté ; étiquettes des axes dans les marges (`X →`, `Z ↑`, valeurs en cm) ; barre d'échelle en bas à gauche.
3. Marqueurs des tomates : cercle numéroté par identifiant, couleur selon état (vert, orange, rouge), coordonnées XYZ en cm à côté, badge « occultée » si moins de 50 % de la tomate est visible dans cette vue (calculé par un rendu d'identifiants).
4. Tige cible : polyligne du pédoncule de la tomate cible en cyan ; ciseaux : pivot, deux lames, point de coupe en croix, axe lame et normale projetés en deux couleurs, ouverture et angles en texte ; panier : rectangle projeté avec centre marqué ; verticale de chute : ligne pointillée de la tomate cible vers le plan du panier avec la position d'impact prédite.
5. Bandeau haut : nom de la vue, axes visibles, position et angles de la caméra, facteur d'échelle en px/cm, temps sim.

Le JSON qui accompagne les images :

```
{
  "sim_time_s": number,
  "phase": Phase,
  "tomatoes": [{ "id", "state", "ripeness": 0..1, "position_cm": [x,y,z], "stem": { "from_cm", "to_cm" }, "visible_in": { "top": 0..1, "front": 0..1, "side": 0..1 } }],
  "scissors": { "cut_point_cm", "yaw_deg", "pitch_deg", "roll_deg", "opening_deg", "blade_axis", "blade_normal" },
  "basket": { "center_cm", "size_cm", "z_cm" },
  "cameras": { "top": { "position_cm", "yaw_deg", "tilt_deg", "px_per_cm" }, ... },
  "limits": { "scissors_reach_cm", "basket_rail_cm", "camera_rails_cm" }
}
```

## 5. Serveur (`packages/server`)

- **MCP** : `@modelcontextprotocol/sdk`, transport streamable HTTP sur `localhost:7331/mcp`. Outils :

| Outil | Arguments | Retour |
|---|---|---|
| `get_status` | — | phase, tomates connues, pose des outils, dernier événement, limites |
| `get_views` | `cameras?: ("top" / "front" / "side")[]` | 1 à 3 images PNG + JSON (section 4.5) |
| `move_camera` | `camera, dx?, dy?, dz?, yaw?, tilt?, zoom?` (relatif) | nouvelle pose + vue rafraîchie de cette caméra |
| `move_scissors` | `x, y, z, mode: "relative" / "absolute"` | pose résultante ou erreur `out_of_reach` / `collision` |
| `rotate_scissors` | `yaw?, pitch?, roll?, mode` | pose résultante |
| `open_scissors` | — | ouverture |
| `cut` | — | `stem_cut` / `nothing_between_blades` / `leaf_cut` / `misaligned` avec mesures |
| `move_basket` | `x, y, mode` | position résultante ou `out_of_rail` |
| `report` | `outcome: "harvested" / "missed" / "aborted", note` | accusé, clôt l'épisode |

  Toutes les erreurs sont des retours textuels structurés, jamais des exceptions, pour que l'agent puisse corriger.

- **Hub WebSocket** : un client navigateur, un ou plusieurs clients dashboard (même page). Messages typés dans `shared`.
- **Bus d'événements et phases** : machine à états dans `shared`, appliquée par le serveur.
- **Journal** : chaque épisode dans `data/episodes/<horodatage>.json` (événements, tool calls, images en base64 optionnel, coût, durée). Sert au replay.
- **Runner d'agent** : Claude Agent SDK TS, `includePartialMessages` activé, MCP robot déclaré en HTTP, aucun autre outil autorisé, modèle configurable par variable d'environnement, limite de 40 tool calls par épisode puis `report` forcé. Reprise de session entre épisodes. Les événements sont convertis en messages `agent_text`, `tool_call_start`, `tool_call_result`, `episode_end` pour le dashboard.
- **Prompt système** : rôle, repère monde, sémantique des vues et des schémas, unités, procédure recommandée en boucle fermée (regarder ; panier sous la tomate en tenant compte de la verticale de chute ; approche des ciseaux par étapes de 5 cm puis 1 cm ; vérifier dans la vue où la tige est dans le plan que la ligne de coupe est perpendiculaire à la tige et dans les deux autres que le point de coupe est sur la tige ; couper ; vérifier ; rapporter). Demande un raisonnement court et explicite avant chaque action.

## 6. Dashboard (dans `packages/sim`)

Page plein écran 1920×1080, thème sombre, Vite + React + Tailwind, Three.js pour la scène.

- **Gauche (55 %)** : vue spectateur 3D orbitable, frustums des trois caméras dessinés, bras, panier, plant.
- **Droite haut** : les trois vues annotées telles que reçues par l'agent, clic pour agrandir, flash bref à chaque `get_views`.
- **Droite bas** : trace de l'agent, plus récent en haut : texte, tool calls en langage clair avec arguments, résultats, durée, erreurs surlignées.
- **Bandeau haut** : pastilles de phase, compteurs récoltées/ratées, temps sim et facteur, modèle, coût cumulé.
- **Bandeau bas repliable** : schéma bloc Simulation → Perception → Serveur MCP → Agent → Dashboard, bus d'événements ; bloc et flèche actifs allumés à chaque message.
- **Contrôles de tournage** : pause, vitesse, « mûrir la prochaine tomate », « nouveau plant », replay d'un épisode, masquer les contrôles, mode « ce que voit l'agent » (vues agrandies).
- **Palette** : rouge mûr, vert immature, orange en transition, cyan tige cible, magenta ciseaux, jaune panier, blanc contours, gris axes monde.

## 7. Cycle de développement adapté

Repris de `/cycle` v2 de Marcel, allégé pour une démo à échéance courte. Fichiers dans `.claude/`.

- **Contrat** : cette spec + une checklist `docs/superpowers/specs/2026-09-17-tomato-harvest-demo-checklist.md` avec items `[SPEC-N]`, `[TEST-N]`, `[GATE-N]` par module. Un PR avec un item non coché est invalide.
- **Agents** :
  - `builder` (opus) : un module par PR, TDD, coche la checklist, gates, PR. Travaille dans un worktree. Ne merge pas.
  - `judge` (fable) : preuves fichier:ligne par `[SPEC-N]`, test réel par `[TEST-N]`, sortie fraîche des gates, refus si placement de fichier hors du package prévu.
  - `visual-checker` (opus) : pour les PR touchant au rendu ou aux annotations, captures Playwright de la scène et des vues, comparées aux critères des sections 4.5 et 6 ; verdict avec captures en preuve.
  - `cleaner` : supprime les artefacts de session selon des motifs explicites (verdicts, captures, worktrees mergés) ; jamais de fichier suivi.
- **Supprimé par rapport à Marcel** : researcher (plan écrit en fil principal), ux-verifier et examiner (remplacés par visual-checker), garde de données (pas de DB).
- **Skills** : `/cycle` (prend l'issue suivante, builder → judge → visual-checker si rendu → merge rebase → cleaner ; 2 retries max), `/plan` (crée les issues GitHub depuis le plan, une par module), `/status`, `/checkpoint`.
- **Parallélisme** : les modules d'une même étape sont dispatchés en même temps, un builder par worktree, sur les contrats figés de `shared`. Les issues portent un label d'étape `S:1` à `S:4`.
- **Branches** : `main` protégée par convention, PR par module, rebase merge.

## 8. Tests et gates

- **Unitaires (Vitest, Node)** : projection monde → pixels et espacement de grille ; IK (pose → angles → pose) ; règles de coupe ; test « dans le panier » ; mûrissement et déclenchement ; machine à états des phases ; validation des arguments des outils et messages d'erreur ; conversion des événements du stream agent en messages dashboard ; dessin des schémas (positions calculées des points, testées sans canvas).
- **Intégration (Vitest)** : MCP server monté avec un faux navigateur ; chaque outil renvoie la forme attendue ; un épisode scripté aboutit à `harvested` ; un épisode où le panier est mal placé aboutit à `missed`.
- **Navigateur (Playwright)** : la page charge, la scène rend, `get_views` via le serveur renvoie trois PNG et un JSON cohérent ; captures pour le visual-checker.
- **Gates par PR** : `npm run lint`, `npx tsc --noEmit`, `npm test`, `npm run build`.

## 9. Étapes de développement

Une étape démarre dès que la condition de passage de la précédente est remplie, quel que soit le jour. Les modules d'une même étape sont indépendants et construits en parallèle.

**Étape 1, fondations (séquentiel, fil principal).**

- Monorepo, tooling, README de dev, `.claude/` du cycle adapté, issues GitHub.
- `packages/shared` : tous les types, schémas et la machine à états, figés.
- Scène minimale : sol, éclairage, plant procédural v1, vue spectateur, capture partagée avec le propriétaire.
- Condition de passage : gates verts, capture de scène approuvée par le propriétaire, contrats de `shared` mergés.

**Étape 2, sim (parallèle, 3 builders).**

- M1 plant complet : mûrissement, feuilles occultantes, physique Rapier de la chute, capteur panier.
- M2 bras et outils : IK, ciseaux, règles de coupe, collision, panier sur rail.
- M3 caméras et annotations : trois caméras orthographiques, render targets, projection, grille et échelle automatiques, marqueurs, schémas ciseaux et panier, verticale de chute, JSON des vues.
- Condition de passage : les trois PR mergées, `get_views` local (sans serveur) produit trois PNG conformes validés par le visual-checker.

**Étape 3, perception, serveur, agent, dashboard (parallèle, 4 builders).**

- M4 perception : Canny + CLAHE, YOLO ONNX + fallback HSV, détecteur de réveil.
- M5 serveur : MCP streamable HTTP, hub WS, bus, phases, journal, replay.
- M6 runner d'agent : Agent SDK, prompt système, réveil et file d'attente, streaming, limite d'appels.
- M7 dashboard : panneaux, trace, statuts, schéma bloc animé, contrôles de tournage.
- Condition de passage : un épisode scripté de bout en bout (sans Claude) passe en intégration ; le dashboard affiche la trace et les vues.

**Étape 4, intégration et tournage (fil principal).**

- Premiers épisodes avec Claude, ajustement du prompt et des annotations d'après les échecs observés, polissage visuel, enregistrement de plusieurs prises, sélection.
- Condition de fin : au moins un épisode `harvested` enregistré en vidéo avec la trace lisible, et un épisode de replay disponible.

## 10. Coupes ordonnées si le temps manque

Toujours conservé : vue 3D, trois vues annotées, ciseaux et panier en schéma, agent réel, trace. Coupes dans cet ordre :

1. YOLO ONNX (le HSV suffit, le dashboard le dit honnêtement).
2. Schéma bloc animé (remplacé par une image statique).
3. Pivot des caméras (translation et zoom seulement).
4. Bras articulé de représentation (ciseaux portés par un support vertical simple).
5. Replay.

## 11. Risques

- **L'agent rate les coupes** : la boucle fermée, les pas de 1 cm et les messages d'erreur mesurés (`misaligned` avec distance et angle) sont là pour ça ; en dernier recours, la tolérance de coupe est un paramètre.
- **YOLO ne reconnaît pas les tomates rendues** : fallback HSV prévu dès le départ.
- **Rendu du plant procédural jugé insuffisant** : module isolé, remplaçable par un glTF libre.
- **Latence de Claude pendant le tournage** : acceptable en vidéo ; le montage peut accélérer ; le replay existe.
- **Dérive de portée** : la section « out » et la liste de coupes font foi ; le judge refuse les fichiers hors module.
