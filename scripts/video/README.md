# Pipeline vidéo de la démo

Deux commandes : on **enregistre** des prises, on **monte** le film. Rien n'est manuel, rien n'est
filmé à l'écran : la page est pilotée par Playwright et ffmpeg assemble le résultat.

    npm run video:record -- --scenario concepts --mode replay --take concepts
    npm run video:record -- --scenario cycle    --mode live   --take cycle
    npm run video:montage -- --episode latest

    npm run video:all        # les trois d'affilée

Le découpage des séquences, les textes et les arrêts sur image sont dans
[`storyboard.md`](storyboard.md) (version lisible) et [`plans/demo.ts`](plans/demo.ts)
(version exécutable). Les deux disent la même chose ; c'est le plan qui fait foi.

## Sorties

| Chemin | Contenu |
|---|---|
| `data/video/takes/<prise>.webm` | la prise brute, 1920×1080 |
| `data/video/takes/<prise>.markers.json` | les marqueurs horodatés de la prise |
| `data/video/work/` | les sous-plans intermédiaires (effacé à chaque montage) |
| `data/video/tomato-demo.mp4` | le film monté |
| `data/video/frames/` | les images extraites pour relire le montage |

`data/video/` est dans `.gitignore` : rien de tout ça n'est versionné.

## Enregistrer une prise en direct

**Le serveur seul, aucun onglet de simulation ouvert.** La page du pilote *est* une simulation :
si une autre page sim est connectée, le hub remplace l'ancienne par celle du pilote, l'ancienne se
reconnecte deux secondes plus tard et reprend la main — les deux se volent la connexion pendant
toute la prise. `record.ts` le vérifie avant de commencer (`GET <api>/health`, champ `simConnected`)
et refuse de démarrer sinon.

Dans un terminal, le serveur :

    npm run start -w @tomato/server      # ou npm run dev:server pendant le développement

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

### Quand une étape échoue

La prise n'est pas perdue : la vidéo est renommée, `<prise>.markers.json` est écrit avec les
marqueurs déjà posés, les marqueurs manquants et l'étape fautive, et le code de sortie est non nul.
Le montage relit ce fichier, prévient que la prise est incomplète, et refuse les segments qui
citent un marqueur absent.

### Options de `record.ts`

| Option | Défaut | Rôle |
|---|---|---|
| `--scenario <concepts\|cycle>` | `concepts` | scénario intégré |
| `--scenario-file <json>` | — | scénario maison, même forme (voir `lib/scenario.ts`) |
| `--mode <live\|replay>` | `replay` | direct (serveur + agent) ou replay d'un journal |
| `--take <nom>` | nom du scénario | nom des fichiers de sortie |
| `--page <url>` | `http://localhost:5173` | page à piloter |
| `--api <url>` | `http://localhost:7331` | HTTP du serveur ; en direct, `/health` doit dire `simConnected: false` |
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

## Comment la prise est capturée, et pourquoi

**Chromium headless (le nouveau), pas headed.** L'écran de la machine fait 1536×960 points
logiques : une fenêtre Chromium de 1920×1080 n'y tient pas, Windows la rogne, et le propriétaire
voit une fenêtre brisée. En headless, la taille de la vue n'a plus rien à voir avec l'écran.

Les trois options ont été mesurées sur cette machine (page complète, épisode scripté en cours) :

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
celle de la page (qui rend à 40 img/s) ; le montage sort en 30 img/s. `gdigrab` / `ddagrab` ont été
écartés pour la raison ci-dessus : ils capturent l'écran, qui ne fait pas 1920×1080 ici.

**Vérifié sur des images extraites** du montage : vue spectateur, colonne de trace, panneau « Session
agent (brut) », vue mise en avant et vignettes, schéma bloc — rien n'est coupé, le texte du
dashboard est net et les accents des sous-titres sont corrects.

## Marqueurs

`record.ts` écrit `<prise>.markers.json` : le nom de chaque marqueur et son instant en
millisecondes **depuis la première image du fichier vidéo** (`performance.timeOrigin` + première
peinture de la page). Sans cette origine, les marqueurs seraient en retard de tout le temps de
chargement — environ deux secondes.

Il reste un décalage de l'ordre d'une demi-seconde entre le moment où un événement apparaît à
l'écran et le moment où le pilote le voit (latence de scrutation de Playwright). Les arrêts sur
image dont l'instant compte vraiment portent donc un `offsetS` dans le plan, calé sur les images
extraites. `montage.ts` affiche l'instant de chaque coupe et de chaque arrêt : c'est là qu'on
ajuste.

## Montage

`montage.ts` résout le plan contre les marqueurs, découpe chaque segment autour de ses arrêts sur
image, produit un fichier par sous-plan puis les concatène :

- **cartons de titre** : fond `0x0E1116`, Segoe UI, titre et sous-titre centrés ;
- **arrêts sur image** : une image extraite à l'instant voulu, tenue 2 à 4 s, avec son sous-titre ;
- **sous-titres** : bandeau noir à 78 %, toujours au même endroit — le bas de la colonne
  spectateur (x 0–800, y 859–935), deux lignes au plus en 34 px alignées à gauche. Cette zone est
  vide dès que les contrôles sont masqués (`h`, pressée au début de chaque scénario), si bien
  qu'un sous-titre ne recouvre jamais le bandeau de statuts, le schéma bloc, la trace ni les vues ;
- **mise en évidence** : quand un arrêt sur image montre un élément précis, le sous-titre ne bouge
  pas ; un cadre bleu clair entoure la zone visée, dont les coordonnées viennent du plan
  (`ZONE` dans `plans/demo.ts`) ;
- **durée minimale d'un sous-titre** : 2,5 s. Un segment plus court est fusionné avec le suivant de
  la même prise et les deux légendes deviennent une phrase — « Coupe, puis chute dans le panier » ;
- **cartons de fin** : résultat, nombre d'appels d'outils, durée et coût **lus dans le journal de
  l'épisode** (`--episode`). Rien n'est inventé : quand le journal ne porte pas de coût, le carton
  n'en annonce pas ;
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

`text_align` règle l'alignement des lignes d'un bloc : `C` pour les cartons, `L` pour les
sous-titres. Le bandeau grandit avec le nombre de lignes, et le montage prévient quand un
sous-titre dépasse deux lignes.

## Organisation du code

    record.ts              CLI d'enregistrement
    montage.ts             CLI de montage
    storyboard.md          le découpage, en français
    plans/demo.ts          le même découpage, exécutable
    scenarios/             concepts.ts, cycle.ts — ce que le pilote fait sur la page
    lib/browser.ts         ouverture de Chromium, mesures GPU et cadence
    lib/health.ts          GET /health et la règle « aucune autre sim connectée »
    lib/recorder.ts        déroulé d'une prise, écriture vidéo + marqueurs
    lib/steps.ts           exécution d'une étape de scénario
    lib/scenario.ts        types et validation d'un scénario
    lib/markers.ts         marqueurs horodatés
    lib/episodes.ts        lecture d'un journal de data/episodes/
    lib/plan.ts            plan de montage, résolution des marqueurs en secondes
    lib/cuts.ts            découpe d'un segment en sous-plans
    lib/ffmpegFilters.ts   construction des filtres ffmpeg (pur, testé)
    lib/ffmpegRun.ts       lancement de ffmpeg et ffprobe
    lib/render.ts          fabrication des sous-plans et concaténation
    lib/cli.ts             lecture des options

Les fonctions pures — filtres, échappement, découpes, résolution des marqueurs — sont testées par
`npm test` (projet vitest `video`), sans lancer ffmpeg ni navigateur.

## Répétition générale

    npm run video:record -- --scenario concepts --mode replay --take concepts --page http://localhost:5313
    npm run video:record -- --scenario cycle --mode replay --take cycle --page http://localhost:5313 \
      --episode 2026-09-18T15-18-32-951Z-t1
    npm run video:montage -- --episode data/episodes/2026-09-18T15-18-32-951Z-t1.json \
      --out data/video/dry-run.mp4 --frames 6 --frames-prefix dry-

Puis regarder les six images de `data/video/frames/`. Une répétition ne demande ni serveur ni
agent : les deux prises sont en replay.

## Dépannage

- **« page sans pont simulé »** : la sim tourne en production. Relancer `npm run dev:sim` ou `npm run demo`.
- **« __name is not defined »** : ne devrait plus arriver — `browser.ts` injecte le fantôme laissé
  par esbuild (`keepNames`) dans les fonctions passées à `page.evaluate`.
- **« prises absentes »** au montage : enregistrer la prise manquante, ou passer `--skip-missing`
  pour monter ce qui existe.
- **Un arrêt sur image tombe à côté** : ajuster l'`offsetS` du plan, relancer `npm run video:montage`
  (sans réenregistrer), puis regarder l'image extraite.
- **« une page de simulation est déjà connectée »** : fermer l'onglet ouvert sur la page de la sim.
  En direct, seuls le serveur et Vite doivent tourner ; la page du pilote est la sim.
- **Port occupé** : le pilote n'ouvre aucun port ; c'est le serveur ou Vite qu'il faut arrêter
  (7331, 7332, 7333, 5173).
