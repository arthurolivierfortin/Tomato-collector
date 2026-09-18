# Storyboard de la vidéo de démo

Deux prises, un montage. Aucune voix : tout passe par des **cartons de titre** (fond bleu nuit,
Segoe UI) et des **sous-titres** en bandeau semi-transparent. Durée visée : 6 à 7 minutes.

**Règle de placement, sans exception : un sous-titre ne masque jamais une information de l'app.**
Il vit toujours au même endroit, dans le bas de la colonne spectateur (x 0–800, y 859–935 en
1920×1080), deux lignes au plus en 34 px, alignées à gauche sur un bandeau noir à 78 %. Cette zone
est vide dès que les contrôles sont masqués — d'où la touche `h` au tout début de chaque scénario.
Le bandeau de statuts (y 0–84) et le schéma bloc (y 960–1080) ne sont donc jamais recouverts.
Quand un arrêt sur image veut montrer un élément précis, le sous-titre **ne bouge pas** : c'est un
**cadre bleu clair** (`drawbox`) qui entoure la zone visée, dont les coordonnées sont dans le plan
(`ZONE` de `plans/demo.ts`). Les cartons plein écran, eux, restent centrés.

- Prise **`concepts`** — scénario `scripts/video/scenarios/concepts.ts`, mode `replay` : la page
  seule (sans serveur ni agent), avec l'épisode scripté de la page (`buildDemoScript`) injecté à
  ×0,2, soit 29 s pour 5,8 s de script. Chaque appel d'outil reste une seconde à l'écran.
  Première touche pressée : `h`.
- Prise **`cycle`** — scénario `scripts/video/scenarios/cycle.ts`, mode `live` pour les prises
  finales (l'agent réel joue l'épisode), `replay` pour les répétitions (un journal de
  `data/episodes/` rejoué à ×1).

Le plan de montage correspondant est `scripts/video/plans/demo.ts` : mêmes sections, mêmes
marqueurs, mêmes textes. Ce fichier-ci est la version lisible ; le plan est la version exécutable.

Les instants ne sont jamais écrits en dur : chaque coupe et chaque arrêt sur image cite un
**marqueur** posé pendant l'enregistrement et relu depuis `<prise>.markers.json`. Refaire une prise
ne demande pas de retoucher le plan.

---

## Partie 1 — « Les concepts » (≈ 2 min 45 s)

Prise `concepts`, mode replay. Touches pressées et marqueurs posés dans cet ordre.

### Ouverture (cartons seuls, 7,5 s)

| Durée | Carton |
|---|---|
| 4 s | **Tomato Collector** — *Un agent Claude récolte des tomates dans une simulation 3D, à l'aide d'outils MCP et de trois vues 2D* |
| 3,5 s | **Partie 1 — Les concepts** — *L'application, le plant, la perception, le réveil, les vues, les outils, la coupe* |

### (a) L'application

- **Enregistrement** : touche `h` (contrôles masqués), la page vient de charger. Marqueur `app` à
  +2,5 s, puis 4 s de plan.
- **Sous-titre** : « Une seule page : la simulation 3D, la trace de l'agent et les vues qu'il reçoit ».
- **Arrêt sur image** — `app`, **3,5 s** : « À gauche la scène et le robot, au centre ce que fait l'agent, à droite ce qu'il voit ».

### (b) Le plant et la tomate qui mûrit

- **Carton** (3 s) : **Le plant et la tomate qui mûrit**.
- **Enregistrement** : rien à déclencher — depuis l'issue #23 la première tomate lance seule sa
  rampe 3 s après le chargement du plant. Marqueur `maturite`, 7 s de plan.
- **Sous-titre** : « Une seule tomate mûrit à la fois ; la rampe du vert au rouge dure 15 s de temps simulé ».
- **Arrêt sur image** — `maturite` + 4 s, **3,5 s**, **cadre sur la cellule de maturité du bandeau
  de statuts** (`ZONE.maturite`) : « Le bandeau de statuts suit la maturité de la tomate en cours ».

### (c) La perception qui détecte

- **Carton** (3 s) : **La perception détecte la tomate mûre**.
- **Enregistrement** : injection de l'épisode scripté à ×0,2, attente de la phase `detected`, marqueur `detection`.
- **Sous-titre** : « Contours Canny + CLAHE, puis YOLOv8 en ONNX si le modèle est présent, seuillage HSV sinon ».
- **Arrêt sur image** — `detection` + 0,6 s, **3,5 s**, **cadre sur le bandeau orange de réveil**
  (`ZONE.reveil`) : « « Tomate 1 mûre détectée → le serveur réveille l'agent » ».

### (d) Le serveur réveille l'agent

- **Carton** (3 s) : **Le serveur réveille l'agent**.
- **Enregistrement** : marqueurs `bloc_perception` et `bloc_reveil`, posés 1,4 s l'un après l'autre
  (la file du schéma bloc allume une flèche toutes les 1,2 s).
- **Sous-titre** (à sa place habituelle, au-dessus du schéma bloc, qui reste entièrement visible) :
  « Le schéma bloc allume les flèches une par une : l'agent dort jusqu'au réveil ».
- **Cadre** sur tout le segment : le schéma bloc (`ZONE.schemaBloc`).
- **Arrêts sur image**, un par flèche, **3 s** chacun :
  1. `bloc_perception` − 1,4 s : « 1. La perception prévient le serveur : tomate 1 mûre, hsv 0,90 »
  2. `bloc_reveil` − 1,4 s : « 2. Le serveur réveille l'agent, qui n'existait pas une seconde plus tôt »

### (e) Les trois vues de l'agent

- **Carton** (3,5 s) : **Les trois vues de l'agent** — *Caméras orthographiques : un centimètre vaut le même nombre de pixels à toute profondeur*.
- **Enregistrement** : touche `z` (loupe plein écran), puis clic sur « Vue top », « Vue front »,
  « Vue side » dans la loupe, marqueurs `vue_top`, `vue_front`, `vue_side`, 3,2 s sur chacune,
  touche `Échap` pour fermer. Puis touche `c` (gizmos des caméras), marqueur `cameras`, 3,2 s,
  touche `c` à nouveau. Puis `v` (mode « ce que voit l'agent » ; les contrôles sont déjà masqués),
  marqueur `mode_agent`, 4 s, puis `v` pour revenir.
- **Sous-titre** : « Grille en centimètres, axes, échelle, marqueurs numérotés, tige, ciseaux et panier ».
- **Arrêts sur image**, **3,5 s** chacun, sans cadre (la loupe occupe déjà tout l'écran) :
  - `vue_top` + 1 s : « Vue top — X vers la droite, Y vers le haut : le panier et sa verticale de chute »
  - `vue_front` + 1 s : « Vue front — X vers la droite, Z vers le haut : la tige et les tomates numérotées »
  - `vue_side` + 1 s : « Vue side — Y vers la droite, Z vers le haut : les ciseaux, leurs axes et leur ouverture »
- **Puis**, sous-titre « Touche c : les trois caméras orthogonales dans la scène, d'où viennent les vues »,
  arrêt sur image `cameras` + 1 s, **3 s** : « Trois rails orthogonaux et un pivot limité : l'agent les déplace lui-même ».
- **Puis**, sous-titre « Touche v : « ce que voit l'agent », les trois vues en grand »,
  arrêt sur image `mode_agent` + 1 s, **3 s** : « L'agent ne reçoit que cela : trois images et du JSON, jamais la scène 3D ».

### (f) Les outils MCP

- **Carton** (3 s) : **Les outils MCP** — *get_views, move_camera, move_basket, move_scissors, rotate_scissors, open_scissors, cut, get_status, report*.
- **Enregistrement** : marqueur `mcp_appel` dès que la ligne « Ciseaux → X 8 » apparaît dans la trace,
  `mcp_resultat` dès que « collision » apparaît dans le flux brut, puis `flux_brut` 1,2 s plus tard.
- **Sous-titre** : « Chaque appel apparaît avec ses arguments et son résultat, en JSON ».
- **Cadre** sur tout le segment : la colonne de trace (`ZONE.trace`).
- **Arrêts sur image** :
  - `mcp_appel` − 0,3 s, **3,5 s** : « L'appel en cours : move_scissors, ses arguments en centimètres, et le chrono qui tourne »
  - `mcp_resultat` + 0,4 s, **4 s** : « Le résultat : une collision, rendue comme une mesure et non comme une exception »
  - `flux_brut` + 1 s, **3,5 s**, cadre déplacé sur le panneau « Session agent (brut) » (`ZONE.sessionBrute`) :
    « Touche t : le flux brut de la session — init, text, tool_use, tool_result, stderr »

### (g) La coupe et la chute dans le panier

- **Carton** (3 s) : **La coupe et la chute dans le panier**.
- **Enregistrement** : marqueurs `coupe` (ligne « Coupe » dans la trace), `chute` (« dans le panier »), `rapport` (« Épisode terminé »).
- **Sous-titre** : « La tige est coupée, la tomate tombe, le panier confirme la récolte ».
- **Cadre** sur tout le segment : la colonne de trace (`ZONE.trace`).
- **Arrêts sur image** :
  - `coupe` + 0,4 s, **3 s** : « cut renvoie la distance au milieu de la tige et l'angle de la lame »
  - `chute` + 0,6 s, **3,5 s** : « La tomate atterrit dans le panier : récolte réussie »

---

## Partie 2 — « Un cycle complet » (≈ 1 min 15 s en replay, 2 à 4 min en direct)

Prise `cycle`. **Aucun arrêt sur image, aucune coupure** : la prise passe d'un bout à l'autre,
seuls les sous-titres changent au passage de chaque phase. C'est le point de la partie : montrer
que rien n'est truqué ni accéléré.

| Carton | Durée |
|---|---|
| **Partie 2 — Un cycle complet** — *De la tomate qui mûrit au rapport de l'agent, sans une seule coupure* | 4 s |

| De | À | Sous-titre |
|---|---|---|
| `murissement` − 2 s | `detection` | Mûrissement |
| `detection` | `observation` | Détection, puis réveil de l'agent |
| `observation` | `positionnement` | Observation : l'agent demande les trois vues et lit la scène |
| `positionnement` | `coupe` | Positionnement : le panier sous la tomate, les ciseaux au milieu de la tige |
| `coupe` | `chute` | Coupe |
| `chute` | `rapport` | Chute dans le panier |
| `rapport` | `fin` | Rapport : l'agent clôt l'épisode et note ce qu'il ferait autrement |

Marqueurs posés par le scénario, dans l'ordre : `debut` (juste après la touche `h`), `murissement`,
`detection` (phase `detected`), `reveil` (+1,5 s), `observation` (« Vues demandées » dans la trace),
`positionnement` (« Ciseaux → »), `coupe` (« Coupe »), `chute` (« dans le panier »),
`rapport` (« Rapport : »), `fin` (+4 s).

### Cartons de fin

| Durée | Carton |
|---|---|
| 4 s | **Résultat : récoltée** — *`--calls` appels d'outils · `--cost` · `--episode-duration` s* |
| 4,5 s | **Un LLM peut piloter un robot** — *à condition de lui donner des outils et des images qui se lisent comme du texte* |

Les trois valeurs du premier carton viennent de la ligne de commande du montage
(`--outcome`, `--calls`, `--cost`, `--episode-duration`) : elles se lisent dans le journal
d'épisode de la prise finale (`data/episodes/<id>.json` : `outcome`, `toolCalls`, `costUsd`).
