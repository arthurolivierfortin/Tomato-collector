# Storyboard de la vidéo de démo

Deux prises, un montage. Aucune voix : tout passe par des **cartons de titre** (fond bleu nuit,
Segoe UI) et des **sous-titres** en bandeau semi-transparent. Durée visée : 6 à 7 minutes.

- Prise **`concepts`** — scénario `scripts/video/scenarios/concepts.ts`, mode `replay` : la page
  seule (sans serveur ni agent), avec l'épisode scripté de la page (`buildDemoScript`) injecté à
  ×0,2, soit 29 s pour 5,8 s de script. Chaque appel d'outil reste une seconde à l'écran.
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
| 4 s | **Tomato Collector** — *Un agent Claude récolte des tomates dans une simulation 3D, par des outils MCP et trois vues 2D* |
| 3,5 s | **Partie 1 — Les concepts** — *L'application, le plant, la perception, le réveil, les vues, les outils, la coupe* |

### (a) L'application

- **Enregistrement** : rien à presser, la page vient de charger. Marqueur `app` à +3 s, puis 5 s de plan.
- **Sous-titre** : « Une seule page : la simulation 3D, la trace de l'agent, les vues qu'il reçoit ».
- **Arrêt sur image** — `app`, **3,5 s** : « À gauche la scène et le robot, au centre ce que fait l'agent, à droite ce qu'il voit ».

### (b) Le plant et la tomate qui mûrit

- **Carton** (3 s) : **Le plant et la tomate qui mûrit**.
- **Enregistrement** : action de sim `ripen_next`, marqueur `maturite`, 7 s de plan.
- **Sous-titre** : « Une seule tomate mûrit à la fois ; la rampe vert → rouge dure 15 s de temps simulé ».
- **Arrêt sur image** — `maturite` + 4 s, **3,5 s**, sur la cellule de maturité du bandeau :
  « Le bandeau suit la maturité de la tomate en cours : « tomate 1 : mûrit 62 % » ».

### (c) La perception qui détecte

- **Carton** (3 s) : **La perception détecte la tomate mûre**.
- **Enregistrement** : injection de l'épisode scripté à ×0,2, attente de la phase `detected`, marqueur `detection`.
- **Sous-titre** : « Contours Canny + CLAHE, puis YOLOv8 en ONNX si le modèle est là, seuillage HSV sinon ».
- **Arrêt sur image** — `detection` + 0,6 s, **3,5 s**, sur le bandeau orange et la pastille de perception :
  « Bandeau orange : « Tomate 1 mûre détectée → le serveur réveille l'agent » ».

### (d) Le serveur réveille l'agent

- **Carton** (3 s) : **Le serveur réveille l'agent**.
- **Enregistrement** : marqueurs `bloc_perception` et `bloc_reveil`, posés 1,4 s l'un après l'autre
  (la file du schéma bloc allume une flèche toutes les 1,2 s).
- **Sous-titre en haut de l'image** (le schéma bloc occupe le bas) :
  « Le schéma bloc allume les flèches une par une : l'agent dort jusqu'au réveil ».
- **Arrêts sur image**, un par flèche, **3 s** chacun :
  1. `bloc_perception` − 1,4 s : « 1. perception → serveur : « tomate 1 mûre, hsv 0,90 » »
  2. `bloc_reveil` − 1,4 s : « 2. serveur → agent : réveil. L'agent n'existait pas une seconde plus tôt. »

### (e) Les trois vues de l'agent

- **Carton** (3,5 s) : **Les trois vues de l'agent** — *Caméras orthographiques : 1 cm vaut le même nombre de pixels, à toute profondeur*.
- **Enregistrement** : touche `z` (loupe plein écran), puis clic sur « Vue top », « Vue front »,
  « Vue side » dans la loupe, marqueurs `vue_top`, `vue_front`, `vue_side`, 3,2 s sur chacune,
  touche `Échap` pour fermer. Puis touche `c` (gizmos des caméras), marqueur `cameras`, 3,2 s,
  touche `c` à nouveau. Puis `v` + `h` (mode « ce que voit l'agent », contrôles masqués),
  marqueur `mode_agent`, 4 s, puis `h` + `v` pour revenir.
- **Sous-titre** : « Grille en cm, axes, échelle, marqueurs numérotés, tige, ciseaux et panier en schéma ».
- **Arrêts sur image**, **3,5 s** chacun :
  - `vue_top` + 1 s : « Vue top — X → droite, Y ↑ : le panier, son centre et la verticale de chute »
  - `vue_front` + 1 s : « Vue front — X → droite, Z ↑ : la tige, les marqueurs numérotés des tomates »
  - `vue_side` + 1 s : « Vue side — Y → droite, Z ↑ : les ciseaux, leurs axes, la normale et l'ouverture »
- **Puis**, sous-titre « Touche c : les trois caméras orthogonales dans la scène — d'où viennent les vues »,
  arrêt sur image `cameras` + 1 s, **3 s** : « Trois rails orthogonaux, un pivot limité : l'agent peut les déplacer lui-même ».
- **Puis**, sous-titre « Touche v : « ce que voit l'agent » — les trois vues en grand, rien d'autre »,
  arrêt sur image `mode_agent` + 1 s, **3 s** : « C'est tout ce que l'agent reçoit : trois images et du JSON, jamais la scène 3D ».

### (f) Les outils MCP

- **Carton** (3 s) : **Les outils MCP** — *get_views, move_camera, move_basket, move_scissors, rotate_scissors, open_scissors, cut, get_status, report*.
- **Enregistrement** : marqueur `mcp_appel` dès que la ligne « Ciseaux → X 8 » apparaît dans la trace,
  `mcp_resultat` dès que « collision » apparaît dans le flux brut, puis `flux_brut` 1,2 s plus tard.
- **Sous-titre** : « Chaque appel est montré avec ses arguments et son résultat, en JSON ».
- **Arrêts sur image** :
  - `mcp_appel` − 0,3 s, **3,5 s** : « L'appel en cours : move_scissors, ses arguments en centimètres, le chrono qui tourne »
  - `mcp_resultat` + 0,4 s, **4 s** : « Le résultat : une collision, rendue comme une donnée mesurée, pas une exception »
  - `flux_brut` + 1 s, **3,5 s** : « Touche t : le flux brut de la session — init, text, tool_use, tool_result, stderr »

### (g) La coupe et la chute dans le panier

- **Carton** (3 s) : **La coupe et la chute dans le panier**.
- **Enregistrement** : marqueurs `coupe` (ligne « Coupe » dans la trace), `chute` (« dans le panier »), `rapport` (« Épisode terminé »).
- **Sous-titre** : « La tige est coupée, la tomate tombe, un capteur dans le panier tranche ».
- **Arrêts sur image** :
  - `coupe` + 0,4 s, **3 s** : « cut : distance au milieu de la tige et angle de la lame, mesurés et rendus à l'agent »
  - `chute` + 0,6 s, **3,5 s** : « Tomate 1 dans le panier → récoltée. L'agent écrit son rapport et se rendort. »

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
| `positionnement` | `coupe` | Positionnement : le panier sous la tomate, les ciseaux jusqu'au milieu de la tige |
| `coupe` | `chute` | Coupe |
| `chute` | `rapport` | Chute dans le panier |
| `rapport` | `fin` | Rapport : l'agent clôt l'épisode et note ce qu'il ferait autrement |

Marqueurs posés par le scénario, dans l'ordre : `debut`, `murissement` (après `ripen_next`),
`detection` (phase `detected`), `reveil` (+1,5 s), `observation` (« Vues demandées » dans la trace),
`positionnement` (« Ciseaux → »), `coupe` (« Coupe »), `chute` (« dans le panier »),
`rapport` (« Rapport : »), `fin` (+4 s).

### Cartons de fin

| Durée | Carton |
|---|---|
| 4 s | **Résultat : récoltée** — *`--calls` appels d'outils · `--cost` · `--episode-duration` s* |
| 4,5 s | **Un LLM peut piloter un robot** — *si on lui donne des outils et des images qui se lisent comme du texte* |

Les trois valeurs du premier carton viennent de la ligne de commande du montage
(`--outcome`, `--calls`, `--cost`, `--episode-duration`) : elles se lisent dans le journal
d'épisode de la prise finale (`data/episodes/<id>.json` : `outcome`, `toolCalls`, `costUsd`).
