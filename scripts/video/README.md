# Pipeline vidéo de la démo

Quatre prises, un montage. Rien n'est manuel : la page est pilotée par Playwright, la fenêtre de
terminal est filmée par ffmpeg, et ffmpeg assemble le résultat. Deux des quatre prises ne coûtent
rien : elles tournent contre un serveur `TOMATO_AGENT=off`.

    npm run video:record -- --scenario concepts  --mode live --take concepts --terminal page
    npm run video:record -- --scenario cycle     --mode live --take cycle    --terminal page
    npm run video:record -- --scenario pipeline  --mode live --take pipeline   # serveur TOMATO_AGENT=off
    npm run video:record -- --scenario detection --mode live --take detection  # serveur TOMATO_AGENT=off
    npm run video:montage -- --episode latest

    npm run video:all        # concepts, cycle, montage

**La vidéo est en anglais.** Tous les textes gravés par le montage (cartons, sous-titres, cartons de
fin) sont en anglais, sans tiret cadratin ni demi-cadratin ; `plans/demo.test.ts` le vérifie. Les
libellés du dashboard, eux, restent ceux de l'application, en français : ils font partie de l'image.

Le découpage des séquences, les textes et les arrêts sur image sont dans
[`storyboard.md`](storyboard.md) (version lisible, en français, avec les textes anglais réels) et
[`plans/demo.ts`](plans/demo.ts) (version exécutable). Les deux disent la même chose ; c'est le plan
qui fait foi.

## Sorties

| Chemin | Contenu |
|---|---|
| `data/video/takes/<prise>.webm` | la prise brute, 1920×1080 |
| `data/video/takes/<prise>.terminal.webm` | le terminal filmé en parallèle (`.mkv` en mode gdigrab) |
| `data/video/server.log` | le flux du serveur, que la page « terminal » suit |
| `data/video/takes/<prise>.markers.json` | les marqueurs horodatés de la prise |
| `data/video/work/` | les sous-plans intermédiaires (effacé à chaque montage) |
| `data/video/tomato-demo.mp4` | le film monté |
| `data/video/frames/` | les images extraites pour relire le montage |

`data/video/` est dans `.gitignore` : rien de tout ça n'est versionné.

## Les quatre prises

| Prise | Mode | Coût | Ce qu'elle montre |
|---|---|---|---|
| `concepts` | `live` | un épisode | la partie 1 : mûrissement, réveil, vues, outils, vérification, coupe |
| `cycle` | `live` | un épisode | la partie 2 : le même cycle, sans une seule coupure |
| `pipeline` | `live`, agent coupé | rien | le traitement des vues, une tuile par étape (issue #36) |
| `detection` | `live`, agent coupé | rien | ce que le modèle voit avant, pendant et après le mûrissement |

**La partie 1 est filmée en direct, avec l'agent réel.** La première version la fabriquait avec
l'épisode scripté de la page (`buildDemoScript`) : la scène 3D ne bougeait pas pendant que la trace
annonçait la chute, et le faux journal contredisait les règles du monde (un `stem_cut` à 78° quand
la règle en demande moins de 45). Le scénario `concepts` attend maintenant des états réels de la
page — une phase, une ligne de la trace, une flèche du schéma bloc — et appuie sur les touches de
tournage à ces moments-là.

**Pourquoi `detection` est une prise à part, elle aussi.** Le panneau « Perception » (touche `p`)
doit être ouvert **avant** que la tomate commence à rougir, et rester ouvert jusqu'au réveil : on y
lit « 0 ripe · 8 unripe », puis la première boîte `ripe` avec sa confiance, puis la porte de réveil
qui se remplit, 1/5, 3/5, 5/5. Dans `concepts`, cette fenêtre-là est prise par le mûrissement vu de
la scène 3D, et l'ouvrir en plus obligerait à couper ailleurs. Filmée seule avec l'agent coupé, la
séquence ne coûte rien : la détection ouvre un épisode mis en scène, sans appeler le SDK, et le
réveil s'allume quand même dans le schéma bloc. Le film s'arrête là et reprend sur `concepts` pour
le réveil et la session de l'agent, qui, eux, sont réels.

**Pourquoi `pipeline` est une prise à part.** L'écran de traitement des vues (touche `x`) ne montre
que de l'image : il n'a besoin ni de l'agent ni du serveur. On la filme quand même en `live`, contre
un serveur lancé avec `TOMATO_AGENT=off` : la détection ouvre alors un épisode mis en scène, sans
appeler le SDK et sans rien coûter, et les tuiles « détection », « appariement », « repères » et
« chute » ont enfin une cible à dessiner. Le glisser au milieu de la prise en
direct coûterait soit la coupe et la chute, masquées par un plein écran pendant une minute, soit un
second épisode payant, puisque la tomate suivante mûrit une quinzaine de secondes après la récolte.
Filmée seule, la séquence ne coûte rien et peut durer ce qu'il faut.

## Enregistrer une prise en direct

**Serveur neuf, et aucun onglet de simulation ouvert.**

1. *Serveur neuf* : `record.ts` refuse de démarrer si `GET <api>/health` ne dit pas `phase: "idle"`.
   Un épisode ouvert que personne ne clôt — typiquement une détection jouée avec `TOMATO_AGENT=off` —
   empêche la détection suivante d'ouvrir le sien, et la prise filmerait un serveur qui ne réagit
   plus. **Redémarrer le serveur avant chaque prise**, ce n'est pas facultatif.
2. *Aucune autre sim* : la page du pilote *est* une simulation. Si un autre onglet sim est connecté,
   le hub remplace l'ancienne sim par celle du pilote, l'ancienne se reconnecte deux secondes plus
   tard et reprend la main, et les deux se volent la connexion pendant toute la prise. `record.ts`
   le vérifie (`simConnected`) et refuse de démarrer sinon.

Dans un terminal, le serveur — de préférence celui que la vidéo va filmer (voir plus bas) :

    ./scripts/video/terminal.ps1          # ouvre la fenêtre « Tomato server » et y lance le serveur

Dans un second, la page (Vite n'ouvre aucun onglet tout seul, et il ne faut pas en ouvrir un) :

    npm run dev:sim

Dans un troisième, la prise :

    npm run video:record -- --scenario cycle --mode live --take cycle

Le pilote ouvre sa propre page (headless, invisible), attend « serveur connecté », masque les
contrôles (`h`), laisse la première tomate mûrir toute seule — depuis l'issue #23 elle démarre sa
rampe 3 s après le chargement du plant — puis suit les phases réelles jusqu'au rapport de l'agent,
en posant un marqueur à chaque étape.

> La sim doit tourner en mode développement (`npm run dev:sim`) : le pont simulé utilisé pour les
> replays n'est exposé par Vite qu'en `import.meta.env.DEV`. Un `vite preview` ne marche pas.

### Les deux prises gratuites, en pratique

`pipeline` et `detection` ne coûtent rien, mais elles ont besoin d'un serveur **à elles** : l'agent
coupé laisse un épisode ouvert que personne ne clôt, et il ne faut pas que ce soit celui du serveur
de production. Un serveur neuf sur des ports d'essai, une sim pointée dessus, et c'est tout :

    TOMATO_AGENT=off TOMATO_LOG_STREAM=on TOMATO_LOG_FILE=data/video/server-detection.log \
    TOMATO_MCP_PORT=7511 TOMATO_WS_PORT=7512 \
    npx tsx packages/server/src/index.ts

    printf 'VITE_TOMATO_WS_URL=ws://localhost:7512\nVITE_TOMATO_API_URL=http://localhost:7511\n' \
      > packages/sim/.env.local
    npx vite --port 5322 --strictPort packages/sim

    npx tsx scripts/video/record.ts --scenario detection --mode live --take detection \
      --page http://localhost:5322 --api http://localhost:7511 \
      --terminal page --terminal-log data/video/server-detection.log

**Effacer `packages/sim/.env.local` ensuite**, sinon la prochaine prise en direct filmera une page
branchée sur un serveur d'essai éteint. Et **lancer la prise sur un Vite déjà chaud** : sur un
démarrage à froid, Vite optimise ses dépendances et recharge la page, ce qui détruit le contexte
d'exécution du pilote (« Execution context was destroyed »). La première tentative échoue, la
seconde passe ; c'est sans conséquence, la prise ratée est simplement réenregistrée.

### Queue de prise : sept secondes, pas plus

Après le rapport de l'agent, `concepts` et `cycle` s'arrêtent en quatre secondes. Au-delà d'environ
quinze secondes, la tomate suivante finit de mûrir, la perception la détecte, et **un second épisode
payant démarre** pendant les cartons de fin. La marge est volontairement large.

### Quand une étape échoue

La prise n'est pas perdue : la vidéo est renommée, `<prise>.markers.json` est écrit avec les
marqueurs déjà posés, les marqueurs manquants et l'étape fautive, et le code de sortie est non nul.
Le montage relit ce fichier, prévient que la prise est incomplète, et refuse les segments qui citent
un marqueur absent.

Le seul point où `concepts` peut s'arrêter sans rien avoir montré de la coupe est l'attente de la
ligne « Ciseaux orientés ». L'agent oriente les lames sur presque tous les épisodes (étape 3 du
prompt système, avant la première approche) ; s'il la saute, la prise garde tout ce qui précède.

### Options de `record.ts`

| Option | Défaut | Rôle |
|---|---|---|
| `--scenario <concepts\|cycle\|pipeline>` | `concepts` | scénario intégré |
| `--scenario-file <json>` | — | scénario maison, même forme (voir `lib/scenario.ts`) |
| `--mode <live\|replay>` | `replay` | direct (serveur + agent) ou replay d'un journal |
| `--take <nom>` | nom du scénario | nom des fichiers de sortie |
| `--page <url>` | `http://localhost:5173` | page à piloter |
| `--api <url>` | `http://localhost:7331` | HTTP du serveur ; en direct, `/health` doit dire `phase: "idle"` et `simConnected: false` |
| `--terminal <page\|gdigrab\|off>` | `off` | comment filmer le terminal |
| `--terminal-log <fichier>` | `data/video/server.log` | mode `page` : le fichier écrit par `TOMATO_LOG_FILE` |
| `--terminal-window <titre>` | `Tomato server` | mode `gdigrab` : titre exact de la fenêtre |
| `--episode <id\|chemin>` | — | journal à rejouer en mode `replay` |
| `--episodes-dir <dossier>` | `data/episodes` | où chercher `<id>.json` |
| `--out <dossier>` | `data/video/takes` | dossier des prises |
| `--dry-run` | — | valide le scénario sans rien enregistrer |

### Options de `montage.ts`

| Option | Défaut | Rôle |
|---|---|---|
| `--episode <journal\|latest>` | — | **obligatoire** : journal d'où sont lus les cartons de fin ; `latest` prend le plus récent de `--episodes-dir` |
| `--episodes-dir <dossier>` | `data/episodes` | où `latest` cherche |
| `--takes <dossier>` | `data/video/takes` | prises à monter |
| `--out <fichier>` | `data/video/tomato-demo.mp4` | film produit |
| `--work <dossier>` | `data/video/work` | sous-plans intermédiaires |
| `--plan-file <json>` | — | plan de montage maison |
| `--frames <n>` `--frames-dir` `--frames-prefix` | `0`, `<out>/frames`, `frame-` | images extraites pour relecture |
| `--skip-missing` | — | monte même si une prise citée par le plan manque |

## Le terminal à l'image

Sans terminal, un spectateur peut croire que la session de l'agent est une mise en scène du
dashboard. La vidéo filme donc, en parallèle de la page, **la sortie réelle du processus serveur**.

1. **Le serveur écrit son flux dans un fichier.** `TOMATO_LOG_STREAM=on` imprime sur la sortie
   standard exactement les lignes que le dashboard reçoit, une couleur par nature d'événement,
   base64 filtré : les lignes du serveur lui-même (`server`, dont « prêt : … agent on
   (claude-opus-5) »), le réveil (`wake`), le flux du SDK (`init`, `text`, `tool_use`,
   `tool_result`, `result` avec le coût), le versant MCP de chaque appel (`mcp`, avec ses arguments,
   sa réponse et son chrono) et les événements de simulation (`sim`). `TOMATO_LOG_FILE=<chemin>`
   recopie ces mêmes lignes, codes ANSI compris, dans un fichier, vidé au démarrage : une prise
   filme une session, pas l'historique de la machine.

2. **Une page suit ce fichier.** `scripts/video/terminal/index.html` est une page statique : barre
   de titre « Tomato server · Claude Code session », police monospace, curseur qui clignote,
   défilement automatique. Elle demande les nouvelles lignes toutes les 100 ms à un petit serveur
   local que `record.ts` ouvre sur un port libre de 127.0.0.1, et les affiche telles quelles. Le
   HTML coloré est produit côté Node (`lib/ansi.ts`, testé) ; la page ne fait que le coller. Aucune
   bibliothèque, aucun CDN : un navigateur headless n'a pas toujours le droit d'aller en chercher
   une, et cette page-là n'en a pas besoin.

   **C'est la sortie réelle du processus, pas une reconstitution** : chaque ligne à l'écran a été
   écrite par le serveur, dans l'ordre où il l'a écrite.

3. **Playwright la filme.** `--terminal page`, le défaut, ouvre une seconde page headless de
   960×600 dans le même navigateur, au moment même où s'ouvre la page du dashboard : les deux vidéos partagent
   l'horloge de la prise, et le décalage (quelques centaines de millisecondes) est écrit dans
   `<prise>.markers.json`. Rien ne dépend du bureau Windows, donc la capture marche depuis
   n'importe quelle session, y compris sans écran.

4. **Le montage l'incruste.** Un segment qui porte `pip` met le terminal par-dessus la prise :
   vignette de 610×168 en bas à droite pendant toute la partie 2 dès le réveil, et moitié droite de
   l'écran en partie 1, sur le segment « The agent is a real Claude Code session », avec un arrêt
   sur image sur le premier `tool_use` de la session. La vignette faisait 180 px de haut jusqu'à la
   v2 : elle descendait à y 940 et effleurait les étiquettes « top … » et « side … » des vignettes
   de vues, qui commencent à y 932. Ces étiquettes sont maintenant déclarées dans `PROTECTED`, et
   c'est le test de géométrie qui le voit, plus une relecture d'image.

   La vignette occupe la rangée de vignettes de vues, la seule bande de l'écran dont l'information
   est redondante, et elle est **rognée par le bas** plutôt que réduite : on lit les dernières
   lignes de la console au lieu de la page entière devenue illisible. Les zones qu'aucune vignette
   ne doit recouvrir sont déclarées (`PROTECTED` dans `plans/zones.ts`) — bandeau de statuts, trace,
   vue mise en avant, schéma bloc **et son étiquette d'activité**, bandeau de sous-titre — et
   `plans/demo.test.ts` vérifie zone par zone qu'elle n'en touche aucune. Le demi-écran, lui,
   recouvre volontairement la trace et la vue mise en avant : un carton l'annonce, le terminal
   devient le sujet ; il laisse en revanche le sous-titre libre.

### `--terminal gdigrab`, l'option

`gdigrab` filme une **vraie fenêtre de console** par son titre ; `scripts/video/terminal.ps1` en
ouvre une, au titre stable, dimensionnée à 960×620 et placée en haut à gauche. C'est plus
authentique, mais ffmpeg exige alors une fenêtre **visible sur le bureau interactif** : titre exact,
fenêtre non réduite, non masquée. Une session non interactive (agent, service) n'a pas de bureau et
la capture y échoue toujours — c'est pourquoi le défaut est la page. Si ffmpeg ne trouve pas la
fenêtre, il s'arrête, la prise continue, le fichier de marqueurs n'annonce aucune piste, et le
montage prévient puis monte sans incrustation.

## Marqueurs

`record.ts` écrit `<prise>.markers.json` : le nom de chaque marqueur et son instant en
millisecondes **depuis l'ouverture de la page de capture**. C'est là que Playwright démarre son
screencast, donc c'est le t = 0 du fichier vidéo. Avant, l'origine était la première peinture de la
page : tous les arrêts sur image étaient en avance de tout le temps de chargement, un peu moins
d'une seconde sur un Vite chaud, une dizaine de secondes sur un Vite froid. La première peinture
reste écrite dans le fichier (`firstPaintMs`), à titre indicatif.

Il reste un décalage de l'ordre d'une demi-seconde entre le moment où un événement apparaît à
l'écran et le moment où le pilote le voit (latence de scrutation de Playwright). Les arrêts sur
image dont l'instant compte vraiment portent donc un `offsetS` dans le plan, calé sur les images
extraites. `montage.ts` affiche l'instant de chaque coupe et de chaque arrêt : c'est là qu'on ajuste.

**Les marqueurs sont posés dans l'ordre du scénario.** Un segment qui va d'un marqueur au suivant ne
peut donc ni s'inverser ni empiéter sur le précédent, quelle que soit la vitesse de l'épisode filmé.
C'est cette règle qui rend le plan robuste, et c'est pourquoi les décalages négatifs y sont rares et
toujours plus petits que l'écart minimal garanti par le scénario.

Deux conséquences visibles :

- le marqueur `rotate` est posé quand le pilote **revient à la trace**, pas quand l'agent appelle
  `rotate_scissors` : la ligne est là depuis un moment et la trace a défilé. Les légendes de ce
  segment parlent donc de l'appel qui est à l'écran, quel qu'il soit ;
- si l'agent va plus vite que les temps de maintien du scénario, la coupe est déjà passée quand le
  pilote revient en vue spectateur. La prise reste valide, la partie 2 montre de toute façon la
  chute en direct et sans coupure.

### Étapes derrière une vanne

Une étape `gate` presse une touche et **ouvre une vanne du même nom si l'écran attendu apparaît**.
Les étapes qui portent `gate: <nom>` ne sont jouées que si la vanne est ouverte. C'est ainsi que le
scénario montre un panneau livré par une autre branche sans casser la prise tant qu'il n'est pas là.

Deux écrans de l'issue #36 sont dans ce cas : le panneau « Perception » (touche `p`, dans
`concepts`) et l'écran de traitement des vues (touche `x`, prise `pipeline`). Les marqueurs
correspondants — `perception_panel`, `pipeline_1` à `pipeline_10` — restent **facultatifs** : ils ne
comptent pas dans les marqueurs prévus, et les segments du plan qui les citent portent
`optional: true`. Au montage, ces segments sont retirés avec un avertissement au lieu de faire
échouer le film.

**Ces deux écrans sont là depuis la fusion de #36, et le plan a été recalé sur eux** (prises du
2026-09-18) :

- l'écran `x` range **dix** étapes en deux rangées de cinq, et non sept en deux rangées de quatre
  comme le plan l'avait anticipé. `scenarios/pipeline.ts` pose donc dix marqueurs, et
  `pipelineTile()` (`plans/zones.ts`) rend la grille mesurée sur la page :
  x = 16 + 380 c, y = 56 + 508 r, tuiles de 368 × 496 ;
- les zones encadrables de `plans/zones.ts` ont été **mesurées** au lieu d'être estimées
  (`getBoundingClientRect` sur les `data-testid` du dashboard en 1920×1080). La cellule de maturité
  vivait 70 px trop à gauche, la trace s'arrêtait 120 px trop haut. Le panneau « Perception » a sa
  zone à lui, et l'arrêt sur image du segment `p` l'encadre ;
- l'écran `x` est plein format : le bandeau de sous-titre du dashboard, calé à 145 px du bas, y
  tomberait au milieu des tuiles de la seconde rangée. Les segments du pipeline le descendent à
  29 px du bas (`captionBottom`) et lui font prendre **toute la largeur** (`captionFullWidth`).
  La boîte qui épouse le texte, parfaite sur le dashboard, laissait dépasser à sa droite un fragment
  de la rangée de légendes françaises des tuiles : une bande pleine, d'un bord à l'autre et jusqu'au
  bas de l'image, ne laisse plus rien dépasser. Le cadre bleu est dessiné **après** la bande, pour
  que l'arête inférieure des tuiles de la rangée du bas reste visible.

## Répétition sans coût

Comment la partie 1 a été mise au point sans lancer une seule session payante, et comment la refaire :

1. Un serveur **neuf**, agent coupé, flux console activé et recopié dans le fichier que la page
   « terminal » suivra, sur des ports d'essai :

       TOMATO_AGENT=off TOMATO_LOG_STREAM=on TOMATO_LOG_FILE=data/video/server.log \
       TOMATO_MCP_PORT=7471 TOMATO_WS_PORT=7472 TOMATO_WAKE_PORT=7473 \
       npx tsx packages/server/src/index.ts

2. La sim, sur un port d'essai, pointée sur le WebSocket du serveur d'essai
   (`packages/sim/.env.local` avec `VITE_TOMATO_WS_URL=ws://localhost:7472`, à effacer ensuite) :

       npx vite --port 5318 --strictPort packages/sim

3. Le faux agent, qui rejoue les appels d'outils d'un **vrai journal** sur le **vrai serveur MCP** :

       npx tsx scripts/video/rehearse.ts --api http://localhost:7471 \
         --episode data/episodes/2026-09-18T16-36-29-196Z-t1.json

   Il attend qu'une détection ouvre un épisode (agent coupé, le réveil est mis en scène), puis
   appelle `get_views`, `move_basket`, `rotate_scissors`, … `report` aux instants du journal. Le
   dashboard reçoit donc de vrais appels, de vraies vues et de vrais événements de simulation.

4. La prise, comme en vrai :

       npx tsx scripts/video/record.ts --scenario concepts --mode live --take concepts \
         --page http://localhost:5318 --api http://localhost:7471 \
         --terminal page --terminal-log data/video/server.log

**Ce qui manque à une répétition** : le texte que l'agent écrit entre deux appels et le flux brut de
la session viennent du SDK. Le panneau « Session agent (brut) » reste donc vide et affiche « En
attente du flux de la session agent ». Tout le reste est identique.

Résultat de la répétition du 2026-09-18 : les **dix-sept marqueurs** de `concepts` posés, aucun
manquant, code de sortie 0, piste terminal à +0,25 s de la prise. La coupe et la chute sont bien
tombées **après** le retour en vue spectateur (`normal_view` 66,0 s, `cut` 68,5 s), et le journal
filmé porte le démarrage, la détection, le réveil mis en scène et les douze appels MCP.

La prise `cycle` a été rejouée de la même façon, en `replay` contre le même journal. **En replay, la
vignette du terminal ne suit pas l'épisode rejoué** : la page du terminal montre le fichier tel
qu'il est à ce moment-là, c'est-à-dire la session qui a réellement tourné, pas celle du journal.
Utile pour caler l'incrustation, trompeur dans un film final : les deux prises finales se font en
direct, où le terminal et la page racontent le même épisode.

Puis le montage d'essai :

    npx tsx scripts/video/montage.ts --episode data/episodes/2026-09-18T16-36-29-196Z-t1.json \
      --out data/video/dry-run.mp4 --frames 16 --frames-prefix dry-

Il sort quatre minutes en 58 sous-plans et retire les huit segments facultatifs (panneau Perception
et les sept tuiles du traitement des vues) avec un avertissement chacun.

## Style des sous-titres

Deux styles ont été comparés sur la même image extraite (bas de la colonne spectateur, partie 2) :

| | Ancien | Nouveau (retenu) |
|---|---|---|
| Fond | bandeau plein, 800 px de large, noir à 78 % | boîte qui épouse le texte, noir à 70 % |
| Corps | 34 px | 31 px |
| Marge | 16 px | 18 px, interligne 1,45 |
| Ombre | aucune | portée, noir à 85 %, décalée de 2 px |
| Entrée | brutale | fondu de 0,3 s, en entrée et en sortie |

Le nouveau gagne sur les deux points qui comptent : il pose beaucoup moins d'encre sur la scène 3D —
un sous-titre court n'occupe plus que sa propre largeur au lieu des 800 px de la colonne — et le
texte reste parfaitement lisible sur une image claire grâce à l'ombre. Tout tient dans la même zone
réservée, donc la règle de placement ne bouge pas.

## Comment la prise est capturée, et pourquoi

**Chromium headless (le nouveau), pas headed.** L'écran de la machine fait 1536×960 points
logiques : une fenêtre Chromium de 1920×1080 n'y tient pas, Windows la rogne, et le propriétaire
voit une fenêtre brisée. En headless, la taille de la vue n'a plus rien à voir avec l'écran.

Les trois options ont été mesurées sur cette machine (page complète, épisode en cours) :

| Option | Rendu WebGL | rAF | Verdict |
|---|---|---|---|
| headless (`channel: 'chromium'`, `--use-angle=d3d11`) | ANGLE / **NVIDIA RTX A1000**, D3D11 | 40–43 img/s | **retenue** : 1920×1080 natif, aucune fenêtre |
| headed `--force-device-scale-factor=0.8` | ANGLE / NVIDIA, D3D11 | 44 img/s | fenêtre visible, dépend de la taille d'écran |
| headed 1536×864 puis agrandissement | ANGLE / NVIDIA, D3D11 | 38 img/s | image ré-échantillonnée, texte moins net |

Le headless **n'est pas** en rendu logiciel : `record.ts` lit `UNMASKED_RENDERER_WEBGL` au
démarrage, l'affiche, et prévient si « SwiftShader » apparaît. `--force_high_performance_gpu`
fait choisir la NVIDIA plutôt que l'Intel intégrée.

La capture passe par `recordVideo` de Playwright (screencast CDP, VP8 en `.webm`) : **1920×1080 à
25 img/s exactement**, 40 ms entre chaque image, sans à-coup. C'est la cadence de Playwright, pas
celle de la page (qui rend à 40 img/s) ; le montage sort en 30 img/s. `gdigrab` reste réservé à la
fenêtre de terminal, qui, elle, est petite et visible.

## Montage

`montage.ts` résout le plan contre les marqueurs, découpe chaque segment autour de ses arrêts sur
image, produit un fichier par sous-plan puis les concatène :

- **cartons de titre** : fond `0x0E1116`, Segoe UI, titre et sous-titre centrés ;
- **arrêts sur image** : une image extraite à l'instant voulu, tenue 2 à 4,5 s, avec son sous-titre ;
- **sous-titres** : un seul `drawtext`, avec son propre fond (`box=1`) et sa marge (`boxborderw`),
  toujours au même endroit — le bas de la colonne spectateur, vide dès que les contrôles sont
  masqués (`h`, pressée au début de chaque scénario) ;
- **mise en évidence** : quand un arrêt sur image montre un élément précis, le sous-titre ne bouge
  pas ; un cadre bleu clair entoure la zone visée, dont les coordonnées viennent du plan
  (`ZONE` dans `plans/zones.ts`) ;
- **agrandissement** : quand le cadre ne suffit pas — une tuile du traitement des vues fait 368 × 496
  dans une image de 1920 × 1080, son texte quatre pixels de haut — l'arrêt sur image porte un `zoom`.
  La zone est recadrée, mise à 85 % de la hauteur en `lanczos`, posée sur le fond des cartons, ceinte
  du même liseré bleu, et ses trois éléments s'écrivent dans la colonne de droite, jamais dessus :
  `Input:`, `Done by:` (en bleu, c'est la ligne qui répond à « le modèle ou la simulation ? ») et
  `Output:`. La géométrie et les filtres sont dans `lib/zoom.ts`, purs et testés ;
- **bandeau pleine largeur** : `captionFullWidth` remplace la boîte qui épouse le texte par une bande
  opaque d'un bord à l'autre, pour les écrans plein format où tout ce qui reste à côté du sous-titre
  se lit encore à moitié ;
- **incrustation du terminal** : `pipComplex` met la prise au fond, le terminal dans sa zone avec un
  liseré bleu, puis les sous-titres par-dessus ;
- **durée minimale d'un sous-titre** : 2,5 s. Un segment plus court est fusionné avec le suivant de
  la même prise et les deux légendes deviennent une phrase — « Cut, then the fall into the basket » ;
- **aucune seconde deux fois** : les segments d'une même prise se relaient dans l'ordre et bout à
  bout. `plans/demo.test.ts` résout le plan contre les marqueurs réels des quatre prises et refuse
  le moindre chevauchement. La v2 rejouait 3,8 s de `concepts` — le panneau « Perception », puis le
  segment du réveil reparti du même marqueur ; c'est ce test qui l'aurait vu tout de suite ;
- **cartons de fin** : résultat, nombre d'appels d'outils, durée et coût **lus dans le journal de
  l'épisode** (`--episode`). Rien n'est inventé : quand le journal ne porte pas de coût, le carton
  n'en annonce pas ; quand il n'est pas clos (`outcome: null`), le montage refuse de partir ;
- **police** : Segoe UI, sinon Arial, sinon DejaVu Sans ; l'absence des trois est une erreur au
  lancement, pas un échec au premier carton ;
- **sortie** : 1920×1080, 30 img/s, H.264, piste audio silencieuse (AAC), `+faststart`.

L'encodeur est `h264_nvenc` si la carte **et le pilote** le permettent, `libx264` sinon. Le test
est un vrai encodage d'une image : `ffmpeg -encoders` liste `h264_nvenc` même quand le pilote
NVIDIA est trop vieux pour l'API nvenc de la compilation installée (c'est le cas ici : nvenc 13.0
contre 13.1 demandée), et le montage échouerait alors au premier plan.

### Trois pièges de `drawtext` sous Windows, tous vérifiés et testés

1. **Chemins** : `C:\…` ne passe pas tel quel dans un filtre — `:` sépare les options. Les chemins
   sont convertis en `'C\:/Windows/Fonts/segoeui.ttf'` par `escapeFilterPath`.
2. **Accents** : le texte passe par `textfile=` (fichier UTF-8), jamais par `text=`. Et
   `expansion=none` est obligatoire, sinon drawtext lit `%` comme de la syntaxe et refuse
   « mûrit 62 % » (« Stray % near … »).
3. **Hauteur de l'image** : dans `drawbox` c'est `ih` (`h` y désigne la hauteur de la boîte) ; dans
   `drawtext` c'est `h`, et écrire `ih` **fait segfault ffmpeg 9**.

Quatrième piège, ajouté avec le fondu : l'expression d'`alpha` contient des virgules, qui coupent
une chaîne de filtres. Elle est donc entre apostrophes.

`text_align` règle l'alignement des lignes d'un bloc : `C` pour les cartons, `L` pour les
sous-titres. Le bandeau grandit avec le nombre de lignes, et le montage prévient quand un
sous-titre dépasse deux lignes.

## Organisation du code

    record.ts              CLI d'enregistrement
    montage.ts             CLI de montage
    rehearse.ts            faux agent MCP pour la répétition sans coût
    terminal.ps1           ouvre et dimensionne la fenêtre de terminal filmée
    storyboard.md          le découpage, en français
    plans/demo.ts          le même découpage, exécutable : assemblage et cartons de fin
    plans/part1.ts         partie 1, plans/part2.ts partie 2
    plans/pipeline.ts      le traitement des vues, plans/detection.ts ce que le modèle voit
    plans/zones.ts         géographie de l'écran : zones encadrables, zones protégées, incrustations
    scenarios/             concepts.ts, cycle.ts, pipeline.ts, detection.ts — ce que le pilote fait
    lib/browser.ts         ouverture de Chromium, mesures GPU et cadence
    lib/health.ts          GET /health, serveur neuf et aucune autre sim
    lib/recorder.ts        déroulé d'une prise, écriture vidéo + marqueurs
    lib/terminal.ts        capture du terminal : page filmée (défaut) ou fenêtre gdigrab
    lib/termServer.ts      serveur local qui sert la page terminal et lui donne les lignes
    lib/ansi.ts            codes ANSI du serveur → HTML coloré (pur, testé)
    terminal/index.html    la page « terminal », sans bibliothèque ni CDN
    lib/steps.ts           exécution d'une étape de scénario
    lib/scenario.ts        types et validation d'un scénario
    lib/markers.ts         marqueurs horodatés
    lib/episodes.ts        lecture d'un journal de data/episodes/
    lib/plan.ts            plan de montage, résolution des marqueurs en secondes
    lib/planGuard.ts       garde de type d'un plan lu depuis un JSON
    lib/cuts.ts            découpe d'un segment en sous-plans
    lib/style.ts           rectangles, format de sortie, style des textes gravés
    lib/ffmpegFilters.ts   construction des filtres ffmpeg (pur, testé)
    lib/zoom.ts            géométrie et filtres d'un agrandissement (pur, testé)
    lib/ffmpegRun.ts       lancement de ffmpeg et ffprobe
    lib/render.ts          fabrication des sous-plans
    lib/renderOutput.ts    dossier de travail, concaténation, images extraites
    lib/cli.ts             lecture des options

Les fonctions pures — filtres, échappement, découpes, résolution des marqueurs, textes du plan —
sont testées par `npm test` (projet vitest `video`), sans lancer ffmpeg ni navigateur.

## Dépannage

- **« le serveur porte déjà un épisode ouvert »** : redémarrer le serveur. C'est presque toujours un
  épisode fantôme laissé par une détection jouée avec l'agent coupé.
- **« page sans pont simulé »** : la sim tourne en production. Relancer `npm run dev:sim` ou `npm run demo`.
- **« __name is not defined »** : ne devrait plus arriver — `browser.ts` injecte le fantôme laissé
  par esbuild (`keepNames`) dans les fonctions passées à `page.evaluate`.
- **« Can't find window … »** (mode `gdigrab`) : le titre de la fenêtre ne correspond pas, ou la
  fenêtre n'est pas sur le bureau interactif. La prise continue sans incrustation ; en mode `page`,
  ce problème n'existe pas.
- **Terminal vide à l'image** : le serveur tourne sans `TOMATO_LOG_FILE`, ou `--terminal-log` ne
  pointe pas sur le même fichier. `record.ts` affiche le chemin suivi au démarrage de la prise.
- **« prises absentes »** au montage : enregistrer la prise manquante, ou passer `--skip-missing`.
- **Un arrêt sur image tombe à côté** : ajuster l'`offsetS` du plan, relancer `npm run video:montage`
  (sans réenregistrer), puis regarder l'image extraite.
- **« une page de simulation est déjà connectée »** : fermer l'onglet ouvert sur la page de la sim.
  En direct, seuls le serveur et Vite doivent tourner ; la page du pilote est la sim.
- **Port occupé** : le pilote n'ouvre aucun port ; c'est le serveur ou Vite qu'il faut arrêter
  (7331, 7332, 7333, 5173).
