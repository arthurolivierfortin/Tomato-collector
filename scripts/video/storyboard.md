# Storyboard de la vidéo de démo

Document de travail, en français. **La vidéo, elle, est entièrement en anglais** : les textes cités
ici entre guillemets sont ceux qui sont réellement gravés dans l'image. Les libellés du dashboard
restent en français, ce sont ceux de l'application.

Quatre prises, un montage. Aucune voix : tout passe par des **cartons de titre** (fond bleu nuit,
Segoe UI) et des **sous-titres** en bas de la colonne spectateur. Durée visée : 6 à 9 minutes,
selon la durée des épisodes filmés en direct.

**Aucune seconde n'est montrée deux fois.** Les segments d'une même prise se relaient dans l'ordre
et bout à bout ; `plans/demo.test.ts` résout le plan contre les marqueurs réels des quatre prises et
refuse le moindre chevauchement. La v2 rejouait 3,8 s de `concepts` (le panneau Perception, puis le
segment du réveil reparti du même marqueur) : c'est exactement ce que ce test empêche.

**Quand un détail compte, on l'agrandit.** Un arrêt sur image peut porter un `zoom` : la zone est
recadrée, mise à 85 % de la hauteur de l'image en `lanczos` sur un fond sombre, entourée du même
liseré bleu, et ses trois éléments s'écrivent à côté d'elle, jamais dessus : `Input:` / `Done by:` /
`Output:`. C'est ainsi que se lisent les dix tuiles du traitement des vues (368 × 496 à l'écran), le
panneau Perception et la vue que l'agent relit avant de couper.

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
- Prise **`pipeline`** (`scenarios/pipeline.ts`), en direct contre un serveur `TOMATO_AGENT=off` :
  le traitement des vues, une tuile par étape. Sans agent, donc sans coût. Segments `optional`.
- Prise **`detection`** (`scenarios/detection.ts`), en direct contre un serveur `TOMATO_AGENT=off` :
  le panneau Perception ouvert du début à la fin, avant, pendant et après le mûrissement. Sans
  agent, donc sans coût.

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
`rotate`, `v` → `agent_view`, `v` → `normal_view`, `cut`, `landed`, `report`, `end`. Deux passages
viennent d'ailleurs : la détection, de la prise `detection`, et le traitement des vues, de la prise
`pipeline`.

Prise `detection`, mode live, serveur `TOMATO_AGENT=off`. Touches et marqueurs : `h`, `p`, `start`,
`ripening_20`, `ripening_60`, `first_ripe_box`, `gate_3`, `gate_5`, `wake`, `end`.

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
- **Segment** : `ripening_50` → `detected` − 4 s. Rien à déclencher : la première tomate lance seule
  sa rampe 3 s après le chargement du plant (issue #23) ; le pilote attend le seuil de 50 %. Le
  mûrissement s'arrête quatre secondes avant la détection : la suite, c'est la prise `detection` qui
  la montre, du point de vue du modèle.
- **Sous-titre** : « One tomato ripens at a time; green to red takes 15 s of simulated time ».
- **Arrêt sur image** — `ripening_50`, **3,5 s**, cadre sur la cellule de maturité (`ZONE.ripening`) :
  « The status bar follows the tomato that is ripening ».

### (c) La perception décide, image par image — prise `detection`

Prise à part, gratuite (`TOMATO_AGENT=off`), panneau Perception ouvert du début à la fin. Elle
remplace l'ancien passage tiré de `concepts`, qui montrait la détection comme un bandeau qui
s'allume : ici on voit la décision elle-même.

**Écran partagé, de bout en bout (v2.2).** La v2.1 posait trois agrandissements du panneau, donc
trois arrêts sur image, et le propriétaire a dit ce qui manquait : on voyait la vue du modèle
seulement une fois la tomate détectée. Toute la séquence est maintenant montée en écran partagé
continu (`RIPENING_SPLIT`) : à gauche la colonne spectateur (55 %), à droite le panneau recadré et
agrandi 2,3 fois (45 %), bande de titre « What the model sees, live » en haut, sous-titre habituel
en bas. Les deux volets bougent ensemble. Les agrandissements sont retirés ; il reste deux arrêts
sur image de **3 s**, dans la même mise en page.

- **Carton** (4 s) : **Perception decides, frame by frame** — *Before, during and after ripeness:
  what the model actually sees, and what it reports*.
- **Segment 1** : `start` → `ripening_20`. « The tomato is still green. The model reports 8 unripe,
  0 ripe. » Le panneau est déjà ouvert : on voit le détecteur tourner avant qu'il y ait quoi que ce
  soit à détecter.
- **Segment 2** : `ripening_20` → `first_ripe_box`. « The tomato turns red. Watch the model's
  boxes. » Dix secondes de lecture continue, sans coupe : la tomate rougit à gauche, le panneau
  suit à droite.
- **Segment 3** : `first_ripe_box` → `gate_5`. « First ripe box: ripe 0.76 on tomato 1. The gate
  starts counting. »
  - **Arrêt sur image** — `first_ripe_box`, **3 s**, dans l'écran partagé.
- **Segment 4** : `gate_5` → `wake` − 0,8 s. « Five consecutive ripe frames: the server is
  notified. »
  - **Arrêt sur image** — `gate_5`, **3 s**, dans l'écran partagé. Vérifié sur les images extraites
    à 20,75 s et 20,95 s : le panneau affiche bien « porte 5/5 · tomate 1 » des deux côtés du
    marqueur.
- **Segment 5** : `wake` − 0,8 s → `wake` + 2 s. « The server wakes the agent. » Le décalage négatif
  n'est pas décoratif : ce qui montre le réveil dans le volet de gauche est le bandeau « Tomate 1
  mûre détectée … le serveur réveille l'agent », et il s'éteint moins d'une seconde après le
  marqueur.

### (d) Le serveur réveille l'agent

Retour sur `concepts`. Les trois segments qui suivent se relaient bout à bout, sans jamais remontrer
les mêmes secondes.

- **Carton** (3,5 s) : **The server wakes the agent** — *The block diagram lights one arrow at a
  time, from perception to the agent*.
- **Segment** : `wake_agent` → +0,9 s, cadre sur le schéma bloc. Pas de sous-titre sur ces neuf
  dixièmes de seconde : une phrase posée puis retirée en moins d'une seconde ne se lit pas.
  - **Arrêt sur image** — `wake_agent` + 0,9 s, **4 s** : « Server to agent: wake up, tomato 1 is
    ripe. The agent does not exist until it is woken. »
- **Segment** — *facultatif, issue #36* : `perception_panel` + 0,9 s → +2,6 s, cadre sur le panneau
  (`ZONE.perceptionPanel`). Sous-titre : « What decides that a tomato is ripe ».
  - **Arrêt sur image** — `perception_panel` + 2,6 s, **4,5 s** : « Ripeness is decided from the
    camera frames, not from simulation state ». Le panneau se referme quatre secondes après son
    ouverture : au-delà de +2,6 s l'arrêt tomberait sur un panneau replié.
- **Segment** : `views_first` − 0,7 s → +1,5 s, cadre sur la trace. Sous-titre : « The agent is
  awake and asks for its views ».
  - **Arrêt sur image** — `views_first` + 1,5 s, **4,5 s** : « First tool call of the episode:
    get_views on all three cameras ».

### (d bis) L'agent est une vraie session Claude Code

- **Carton** (3,5 s) : **The agent is a real Claude Code session** — *The server console, live: init, text, tool_use, tool_result, result*.
- **Segment** : `views_first` + 1,5 s → `lightbox_front` − 1,5 s, **terminal incrusté sur la moitié
  droite** (`PIP.half`, 912×570). C'est le moment où le tout premier `tool_use` de la session
  s'inscrit dans la console.
- **Sous-titre** : « On the right, the server console: the SDK stream as it arrives ».
- **Arrêt sur image** — `views_first` + 2,5 s, **4 s** : « The first tool_use of the session: get_views, and the tool_result that answers it ».
- Sans capture de terminal, le montage prévient et monte le segment sans incrustation.

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

Prise `pipeline`, touche `x`. L'écran livré range **dix** étapes en deux rangées de cinq : c'est
cette grille, mesurée sur la page, que suit `pipelineTile()`.

**Chaque étape se joue en deux temps.** 1,2 s de l'écran entier d'abord, le temps de voir *quelle*
tuile le cadre bleu désigne, puis 4 s de cette tuile **seule, agrandie** à 85 % de la hauteur de
l'image. À 1920 × 1080 une tuile fait 368 × 496 : son texte mesure quatre pixels de haut et personne
ne le lit. À côté de la tuile agrandie, jamais dessus, les trois éléments : `Input:` / `Done by:` /
`Output:`. Le segment s'arrête sur l'agrandissement : rien ne revient à l'écran entier après coup,
et aucune seconde de la prise n'est montrée deux fois.

Deux cartons, portés par les segments eux-mêmes pour disparaître avec eux si la prise manque :
**From camera frame to what the agent sees** — *Ten stages. For each one: what goes in, what does
the work, what comes out.* à l'entrée, et **Second row: the annotation layers** — *Each layer is
labelled by its source: camera calibration, robot state, simulation, geometry, output.* au passage
à la seconde rangée.

Le bandeau de sous-titre descend ici à 29 px du bas et, surtout, il prend **toute la largeur**
(`captionFullWidth`) : le fond qui épouse le texte est le bon choix sur le dashboard, où le bas de
la colonne spectateur est vide, mais sur un écran plein format il laissait dépasser à sa droite un
fragment de la rangée de légendes françaises des tuiles. La bande va maintenant d'un bord à l'autre
et jusqu'au bas de l'image, opaque : plus rien ne dépasse. Le cadre bleu, lui, est dessiné **par
dessus** la bande, pour que l'arête inférieure des tuiles de la rangée du bas reste visible.

| Marqueur | Sous-titre et titre de l'agrandissement | Input · Done by · Output |
|---|---|---|
| `pipeline_1` | Stage 1 of 10: raw camera frame | the 3D scene, seen by the orthographic front camera · camera · an 800 by 800 RGBA buffer, exactly what the sensor reads. No processing yet. |
| `pipeline_2` | Stage 2 of 10: CLAHE contrast | the RGBA buffer · OpenCV (CLAHE, clip 2, tiles 8 by 8) · an equalised grey plane, so dark corners regain contrast |
| `pipeline_3` | Stage 3 of 10: Canny edges | the grey plane · OpenCV (Canny 50/150) · white contours over a render darkened to 35 percent. This is layer one of every agent view. |
| `pipeline_4` | Stage 4 of 10: ripeness detection | the raw frame, reduced to 640 by 640 · model YOLOv8n ONNX · 8 boxes, each with a class and a confidence. Only this stage decides ripe. |
| `pipeline_5` | Stage 5 of 10: box to tomato matching | the 8 boxes and the projected 3D centres · logic · one tomato id per ripe box. No simulation ripeness is read here. |
| `pipeline_6` | Stage 6 of 10: grid, axes and scale | the camera pose and its field of view · camera calibration · the metric frame that makes a view measurable in centimetres |
| `pipeline_7` | Stage 7 of 10: scissors and basket | the arm pose · robot state · blade position, blade angle and basket outline, as the encoders report them |
| `pipeline_8` | Stage 8 of 10: tomato markers and stem line | tomato positions, ids and stems · simulation · numbered circles and a target stem line. This is help given, not measured. |
| `pipeline_9` | Stage 9 of 10: predicted fall line | the target tomato and the basket · geometry (vertical) · the fall line the tomato is expected to follow once the stem is cut |
| `pipeline_10` | Stage 10 of 10: final view | all the layers above · the output stage, every layer stacked · one 800 by 800 PNG per camera, plus a JSON block. Exactly what get_views returns. |

### (e quater) D'où viennent les images

- **Segment** : `gizmos` − 1,5 s → `rotate` − 0,8 s (touche `c`).
- **Sous-titre** : « The three orthogonal cameras in the scene (key c), where the views come from ».
- **Arrêt sur image** — `gizmos` + 1 s, **3 s** : « Three orthogonal rails and a limited pivot. The agent moves them itself. »

### (f) Les outils MCP

- **Carton** (3 s) : **MCP tools: every action is a JSON call** — *get_views, move_camera, move_basket, move_scissors, rotate_scissors, open_scissors, cut, get_status, report*.
- **Segment** : `rotate` − 0,8 s → `agent_view` − 1,6 s. Cadre sur la colonne de trace.
- **Sous-titre** : « Every call shows its arguments and its result, as JSON ».
- **Arrêts sur image** :
  - `rotate` + 0,8 s, **3,5 s** : « One call, one line: the JSON sent, the JSON returned, and how long it took »
  - `rotate` + 2,6 s, **3,5 s**, cadre sur le panneau « Session agent (brut) » : « The raw session stream (key t): init, text, tool_use, tool_result, stderr »

### (f ter) Ce que l'agent reçoit vraiment

- **Segment** : `agent_view` − 1 s → `agent_view` + 3,5 s, `captionWidth: 450`.
- **Sous-titre** : « Agent view (key v) ».
- **Arrêt sur image** — `agent_view` + 1 s, **3 s** : « Three images and JSON. Nothing else. »

### (g) La vérification avant la coupe

L'agent ne coupe pas au jugé. Dans le journal de l'épisode filmé
(`2026-09-18T20-14-09-255Z-t1.json`) : `move_scissors` au point exact, puis « Let me verify the cut
point sits on the cyan stem in the front and side views before cutting », puis
`get_views {"cameras":["front","side"]}`, puis `cut`. **Deux caméras, pas trois** : le sous-titre le
dit comme c'est.

- **Carton** (4 s) : **Before cutting, the agent checks** — *It asks for the views again and reads
  the cut point on the stem before it calls cut*.
- **Segment** : `agent_view` + 3,5 s → `normal_view`, `captionWidth: 450` (toujours en mode « ce que
  voit l'agent »). Sous-titre : « The agent asks for its views again ».
- **Agrandissement** — `agent_view` + 4,9 s, **4,5 s**, sur la vue `front` fraîchement rendue
  (`ZONE.agentFrontView`) : « Before cutting, the agent asks for the front and side views again and
  checks that the blades sit on the stem ». *Input:* the blades closed on the stem midpoint (12.3,
  -5.3, 61.5) · *Done by:* the agent, reading the two views it just asked for · *Output:* magenta
  cut point on the cyan stem, blade normal along it. Only then does it cut.

### (h) La coupe et la chute dans le panier

- **Carton** (3,5 s) : **Cut, fall, basket**.
- **Segment** : `normal_view` → `end`. Cadre sur la colonne de trace.
- **Sous-titre** : « The stem is cut, the tomato falls, a sensor in the basket confirms the harvest ».
- **Arrêts sur image** :
  - `normal_view` + 1,8 s, **4,5 s** : « In the trace: views asked again, then 0.1 cm from the stem
    midpoint, normal aligned. Cutting. » Une seule image porte toute la vérification : l'appel
    `Coupe` en haut, la phrase de l'agent juste dessous, et sous elle les vues redemandées avec leurs
    arguments et leur résultat.
  - `cut` + 1 s, **4 s** : « cut returns the distance to the middle of the stem and the blade angle »
  - `landed` + 1,6 s, **4,5 s** : « The tomato lands in the basket: harvest confirmed »

---

## Partie 2, « Un cycle complet »

Prise `cycle`. **Aucun arrêt sur image, aucune coupure** : la prise passe d'un bout à l'autre, seuls
les sous-titres changent au passage de chaque phase. C'est le point de la partie : montrer que rien
n'est truqué ni accéléré. Dès le réveil, la capture du terminal est **incrustée en vignette** de
610×168 en bas à droite (`PIP.corner`), posée sur la rangée de vignettes de vues et rognée par le
bas pour garder les dernières lignes de la console lisibles : elle ne couvre ni la colonne de
trace, ni la vue mise en avant, ni la vue spectateur, ni le bandeau de statuts, ni le schéma bloc
et son étiquette d'activité, ni le sous-titre. `plans/demo.test.ts` le vérifie zone par zone.

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
