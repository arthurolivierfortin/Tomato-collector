# Storyboard de la vidéo de démo

Document de travail, en français. **La vidéo, elle, est entièrement en anglais** : les textes cités
ici entre guillemets sont ceux qui sont réellement gravés dans l'image. Les libellés du dashboard
restent en français, ce sont ceux de l'application.

Trois prises, un montage. Aucune voix : tout passe par des **cartons de titre** (fond bleu nuit,
Segoe UI) et des **sous-titres** en bas de la colonne spectateur. Durée visée : 6 à 9 minutes,
selon la durée des épisodes filmés en direct.

**Aucun tiret cadratin ni demi-cadratin** dans un texte gravé : deux-points, virgule ou point.
`plans/demo.test.ts` refuse le contraire.

**Règle de placement, sans exception : un sous-titre ne masque jamais une information de l'app.**
Il vit toujours au même endroit, dans le bas de la colonne spectateur (x 24, bas du bandeau à 145 px
du bas de l'image), deux lignes au plus en 31 px, alignées à gauche sur un fond noir à 70 % qui
épouse le texte, avec une ombre portée et un fondu de 0,3 s. Cette zone est vide dès que les
contrôles sont masqués, d'où la touche `h` au tout début de chaque scénario. Le bandeau de statuts
(y 0 à 84) et le schéma bloc (y 960 à 1080) ne sont donc jamais recouverts. Quand un arrêt sur image
veut montrer un élément précis, le sous-titre **ne bouge pas** : c'est un **cadre bleu clair**
(`drawbox`) qui entoure la zone visée, dont les coordonnées sont dans le plan (`ZONE` de
`plans/demo.ts`). En mode « ce que voit l'agent » (touche `v`) la colonne spectateur se réduit à
450 px : le segment concerné le déclare (`captionWidth: 450`). Les cartons plein écran restent
centrés.

- Prise **`concepts`** (`scenarios/concepts.ts`), mode `live` : l'agent réel joue un épisode et le
  pilote appuie sur les touches de tournage aux vrais moments, en attendant des états de la page.
- Prise **`cycle`** (`scenarios/cycle.ts`), mode `live` : le même épisode, mais sans une coupure.
- Prise **`pipeline`** (`scenarios/pipeline.ts`), mode `replay` : le traitement des vues, une tuile
  par étape. Sans agent, donc sans coût. Segments `optional` tant que la touche `x` n'existe pas.

Le plan de montage correspondant est `scripts/video/plans/demo.ts` : mêmes sections, mêmes
marqueurs, mêmes textes. Ce fichier-ci est la version lisible ; le plan est la version exécutable.

Les instants ne sont jamais écrits en dur : chaque coupe et chaque arrêt sur image cite un
**marqueur** posé pendant l'enregistrement et relu depuis `<prise>.markers.json`. Les marqueurs sont
posés dans l'ordre du scénario, donc un segment qui va d'un marqueur au suivant ne peut ni
s'inverser ni empiéter sur le précédent, quelle que soit la vitesse de l'épisode filmé.

---

## Partie 1, « Les concepts »

Prise `concepts`, mode live. Touches pressées et marqueurs posés dans cet ordre : `h`, `app`,
`ripening_50`, `detected`, `wake_perception`, `wake_agent`, (`p` → `perception_panel`),
`views_first`, `z` → `lightbox_front`, `lightbox_side`, `lightbox_top`, Échap, `c` → `gizmos`, `c`,
`rotate`, `v` → `agent_view`, `v` → `normal_view`, `cut`, `landed`, `report`, `end`.

### Ouverture (cartons seuls, 7,5 s)

| Durée | Carton |
|---|---|
| 4 s | **Tomato Collector** — *A Claude agent harvests tomatoes in a 3D simulation, using MCP tools and three annotated 2D views* |
| 3,5 s | **Part 1: the concepts** — *The app, the plant, perception, the wake-up, the views, the tools, the cut* |

### (a) L'application

- **Segment** : `app` → `ripening_50`.
- **Sous-titre** : « One page: the 3D simulation, the agent trace, and the views the agent receives ».
- **Arrêt sur image** — `app` + 1,5 s, **3,5 s** : « Left: the scene and the robot. Middle: what the agent does. Right: what the agent sees. »

### (b) Le plant et la tomate qui mûrit

- **Carton** (3 s) : **The plant and the ripening tomato**.
- **Segment** : `ripening_50` → `detected`. Rien à déclencher : la première tomate lance seule sa
  rampe 3 s après le chargement du plant (issue #23) ; le pilote attend le seuil de 50 %.
- **Sous-titre** : « One tomato ripens at a time; green to red takes 15 s of simulated time ».
- **Arrêt sur image** — `ripening_50`, **3,5 s**, cadre sur la cellule de maturité (`ZONE.ripening`) :
  « The status bar follows the tomato that is ripening ».

### (c) La perception détecte

- **Carton** (3 s) : **Perception detects a ripe tomato**.
- **Segment** : `detected` → `wake_agent`.
- **Sous-titre** : « Contours (Canny + CLAHE), then YOLOv8 (ONNX) or HSV colour thresholding ».
- **Arrêt sur image** — `detected` + 0,5 s, **3,5 s**, cadre sur le bandeau de réveil (`ZONE.wakeBanner`) :
  « Ripe tomato spotted. The server is about to wake the agent. »

### (c bis) Le panneau Perception, touche `p` — *facultatif, issue #36*

- **Segment** : `perception_panel` → +3,8 s. Retiré du montage tant que la touche n'existe pas.
- **Sous-titre** : « What decides that a tomato is ripe ».
- **Arrêt sur image** — `perception_panel` + 1 s, **4 s** : « Ripeness is decided from the camera frames, not from simulation state ».

### (d) Le serveur réveille l'agent

- **Carton** (3 s) : **The server wakes the agent**.
- **Segment** : `wake_agent` → `views_first` + 1,5 s. Cadre sur le schéma bloc pendant tout le segment.
- **Sous-titre** : « The block diagram lights one arrow at a time: the agent does not exist until it is woken ».
- **Arrêts sur image** :
  - `wake_agent` + 0,4 s, **3 s** : « Server to agent: wake up, tomato 1 is ripe »
  - `views_first` + 1 s, **3,5 s**, cadre sur la trace : « First tool call of the episode: get_views on all three cameras »

### (e) Les trois vues de l'agent

- **Carton** (3,5 s) : **What the agent sees: three annotated orthographic views** — *Orthographic cameras: one centimetre is the same number of pixels at any depth*.
- **Segment** : `lightbox_front` − 1,5 s → `gizmos` − 1,5 s (la loupe `z`, puis `side`, puis `top`, Échap).
- **Sous-titre** : « Centimetre grid, axes, scale bar, numbered markers, target stem, scissors and basket ».
- **Arrêts sur image**, **3,5 s** chacun, sans cadre (la loupe occupe déjà tout l'écran) :
  - `lightbox_front` + 1 s : « Front view. X to the right, Z up: the stem and the tomatoes. »
  - `lightbox_side` + 1 s : « Side view. Y to the right, Z up: the scissors and their opening. »
  - `lightbox_top` + 1 s : « Top view. X to the right, Y up: the basket and the fall point. »

### (e bis) Ce qui est mesuré et ce qui est donné

| Durée | Carton |
|---|---|
| 5,5 s | **What is measured, and what is given** — *Tomato markers and the target stem line come from the simulation. Edge extraction, ripeness detection, robot pose and basket come from real image processing and real robot state.* |

### (e ter) Le traitement des vues, étape par étape — *facultatif, issue #36*

Prise `pipeline`, touche `x`. Un segment par tuile, un arrêt sur image de 4,5 s sur chacune, cadre
bleu sur la tuile. Carton d'entrée : **From camera frame to what the agent sees** — *Seven stages.
For each one: what goes in, what does the work, what comes out.*

| Marqueur | Sous-titre du segment | Arrêt sur image |
|---|---|---|
| `pipeline_1` | Stage 1 of 7: raw camera frame | Raw camera frame, straight from the orthographic camera. No processing yet. |
| `pipeline_2` | Stage 2 of 7: CLAHE contrast | CLAHE contrast (OpenCV, plain image processing): flattens the greenhouse lighting. |
| `pipeline_3` | Stage 3 of 7: Canny edges | Canny edge detection (OpenCV, plain image processing): leaves, stems and fruit as white contours. |
| `pipeline_4` | Stage 4 of 7: ripeness detection | Ripeness detection. The work is done by a model: YOLOv8n in ONNX, or HSV colour thresholding when the model is not retained. Out: boxes and a confidence. |
| `pipeline_5` | Stage 5 of 7: box to tomato matching | Box to tomato matching (plain logic): each box is projected back onto the tomatoes of the scene. |
| `pipeline_6` | Stage 6 of 7: annotations | Annotations. Grid and scale come from the camera calibration, scissors and basket from the robot state, tomato markers and the stem line from the simulation, the fall line from physics. |
| `pipeline_7` | Stage 7 of 7: final view | The final view, exactly as the agent receives it: one PNG per camera, plus a JSON block. |

### (e quater) D'où viennent les images

- **Segment** : `gizmos` − 1,5 s → `rotate` − 0,8 s (touche `c`).
- **Sous-titre** : « The three orthogonal cameras in the scene (key c), where the views come from ».
- **Arrêt sur image** — `gizmos` + 1 s, **3 s** : « Three orthogonal rails and a limited pivot. The agent moves them itself. »

### (f) Les outils MCP

- **Carton** (3 s) : **MCP tools: every action is a JSON call** — *get_views, move_camera, move_basket, move_scissors, rotate_scissors, open_scissors, cut, get_status, report*.
- **Segment** : `rotate` − 0,8 s → `rotate` + 2 s. Cadre sur la colonne de trace.
- **Sous-titre** : « Every call shows its arguments and its result, as JSON ».
- **Arrêts sur image** :
  - `rotate` + 0,8 s, **3,5 s** : « One call, one line: the JSON sent, the JSON returned, and how long it took »
  - `rotate` + 1,7 s, **3,5 s**, cadre sur le panneau « Session agent (brut) » : « The raw session stream (key t): init, text, tool_use, tool_result, stderr »

### (f bis) L'agent est une vraie session Claude Code

- **Carton** (3,5 s) : **The agent is a real Claude Code session** — *Same stream, read from the server console: init, text, tool_use, tool_result, result*.
- **Segment** : `rotate` + 2 s → `agent_view` − 1,6 s, **terminal incrusté sur la moitié droite** (`PIP.half`).
- **Sous-titre** : « On the right, the server console: the SDK stream as it arrives ».
- **Arrêt sur image** — `rotate` + 2,8 s, **4 s** : « One tool_use line, its JSON arguments, and the tool_result that answers it ».
- Sans capture de terminal, le montage prévient et monte le segment sans incrustation.

### (f ter) Ce que l'agent reçoit vraiment

- **Segment** : `agent_view` − 1 s → `agent_view` + 3,5 s, `captionWidth: 450`.
- **Sous-titre** : « Agent view (key v) ».
- **Arrêt sur image** — `agent_view` + 1 s, **3 s** : « The agent gets these three images and some JSON. Nothing else. »

### (g) La coupe et la chute dans le panier

- **Carton** (3 s) : **Cut, fall, basket**.
- **Segment** : `normal_view` → `report` + 2 s. Cadre sur la colonne de trace.
- **Sous-titre** : « The stem is cut, the tomato falls, a sensor in the basket confirms the harvest ».
- **Arrêts sur image** :
  - `cut` + 0,4 s, **3 s** : « cut returns the distance to the middle of the stem and the blade angle »
  - `landed` + 0,6 s, **3,5 s** : « The tomato lands in the basket: harvest confirmed »

---

## Partie 2, « Un cycle complet »

Prise `cycle`. **Aucun arrêt sur image, aucune coupure** : la prise passe d'un bout à l'autre, seuls
les sous-titres changent au passage de chaque phase. C'est le point de la partie : montrer que rien
n'est truqué ni accéléré. Dès le réveil, la capture du terminal est **incrustée en vignette** dans
le coin bas droit (`PIP.corner`), hors de la colonne spectateur et au-dessus du schéma bloc.

| Carton | Durée |
|---|---|
| **Part 2: one full cycle** — *From the ripening tomato to the agent report, without a single cut* | 4 s |

| De | À | Sous-titre | Terminal |
|---|---|---|---|
| `murissement` − 2 s | `detection` | Ripening | non |
| `detection` | `observation` | Detection, then the agent wakes up | vignette |
| `observation` | `positionnement` | Observation: the agent asks for the three views and reads the scene | vignette |
| `positionnement` | `coupe` | Positioning: basket under the tomato, scissors at the middle of the stem | vignette |
| `coupe` | `chute` | Cut | vignette |
| `chute` | `rapport` | The fall into the basket | vignette |
| `rapport` | `fin` | Report: the agent closes the episode and notes what it would do differently | vignette |

Un sous-titre affiché moins de 2,5 s est illisible : le montage fusionne alors le segment avec le
suivant et joint les deux légendes. Sur un épisode où la coupe et la chute se suivent de près,
« Cut » et « The fall into the basket » deviennent « Cut, then the fall into the basket ».

Marqueurs posés par le scénario, dans l'ordre : `debut` (juste après la touche `h`), `murissement`,
`detection` (phase `detected`), `reveil` (+1,5 s), `observation` (« Vues demandées » dans la trace),
`positionnement` (« Ciseaux → »), `coupe` (« Coupe »), `chute` (« dans le panier »),
`rapport` (« Rapport : »), `fin` (+3 s). La prise s'arrête **quatre secondes après le rapport** :
au-delà, la tomate suivante mûrit et un second épisode payant démarrerait pendant les cartons de fin.

### Cartons de fin

| Durée | Carton |
|---|---|
| 4 s | **Result: tomato harvested** — *12 tool calls · 61 s · $0.38* |
| 4,5 s | **An LLM can drive a robot** — *given tools it can call and images it can read like text* |

Les valeurs du premier carton sont **lues dans le journal de l'épisode filmé**
(`montage.ts --episode <fichier>` ou `--episode latest`) : `outcome`, `toolCalls`, `costUsd`, et la
durée déduite de `startedAt` / `endedAt`. Aucune n'est saisie à la main. Quand le journal ne porte
pas de coût, le carton n'en annonce pas ; quand il n'est pas clos (`outcome: null`), le montage
refuse de partir plutôt que d'annoncer un résultat qui n'existe pas.
