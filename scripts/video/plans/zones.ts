/**
 * Géographie du dashboard en 1920×1080, contrôles masqués (touche `h`).
 *
 * Deux listes, et une règle qui les relie. `ZONE` nomme ce qu'un arrêt sur image peut entourer d'un
 * cadre bleu. `PROTECTED` nomme ce qu'une incrustation ne doit **jamais** recouvrir : le spectateur
 * doit pouvoir lire, à tout instant, le bandeau de statuts, la trace, la vue mise en avant, le
 * schéma bloc avec son étiquette d'activité, et le sous-titre. `plans/demo.test.ts` vérifie que
 * chaque zone d'incrustation reste en dehors de toutes les zones protégées.
 */
import type { PipSpec, Rect } from '../lib/ffmpegFilters';
import { DEFAULT_STYLE, bandHeight, CAPTION_MAX_LINES } from '../lib/ffmpegFilters';
import type { SplitSpec } from '../lib/split';

/**
 * Rectangles **mesurés** sur la page en 1920×1080, contrôles masqués (`getBoundingClientRect` des
 * `data-testid` du dashboard, prises du 2026-09-18), et non estimés : la cellule de maturité vit à
 * x 640 et non 568, la trace descend à y 508 et non 390. Un cadre posé à côté de ce qu'il désigne
 * est pire que pas de cadre du tout.
 */
export const ZONE = {
  /** Cellule « mûrissement tomate 1 : mûrit 54 % » du bandeau, libellé compris. */
  ripening: { x: 640, y: 8, w: 262, h: 28 },
  wakeBanner: { x: 8, y: 122, w: 788, h: 48 },
  /** Les cinq blocs et leurs flèches, pas tout le pied de page. */
  blockDiagram: { x: 476, y: 980, w: 968, h: 96 },
  /** Colonne de trace : l'en-tête du panneau et la liste des appels. */
  trace: { x: 798, y: 96, w: 486, h: 412 },
  /** Panneau « Session agent (brut) » (touche `t`), sous la trace. */
  rawSession: { x: 798, y: 510, w: 486, h: 415 },
  /** Panneau « Perception » (touche `p`) : il prend la place de la trace quand il s'ouvre. */
  perceptionPanel: { x: 798, y: 514, w: 486, h: 438 },
  featuredView: { x: 1288, y: 112, w: 626, h: 648 },
  /**
   * La vue `front` du mode « ce que voit l'agent » (touche `v`), en haut à droite : c'est là qu'on
   * lit, juste avant la coupe, si le point de coupe est bien posé sur la tige.
   */
  agentFrontView: { x: 1466, y: 110, w: 400, h: 390 },
  /**
   * L'incrustation de la caméra outil (issue #42), **mesurée** sur la page en 1920×1080, contrôles
   * masqués : x 548, y 759, 240 × 180. C'est la géométrie de `insetRect` du côté de la sim — 30 %
   * de la largeur du canvas spectateur, en 4:3, à 12 px du coin bas droit — appliquée au canvas
   * réel (`SPECTATOR_COLUMN`). L'étiquette « caméra outil » vit 18 px au-dessus : elle n'est pas
   * dans cette zone-ci, qui est celle qu'un arrêt sur image agrandit, mais dans `PROTECTED`.
   */
  toolCamera: { x: 548, y: 759, w: 240, h: 180 },
} as const satisfies Record<string, Rect>;

/**
 * Le canvas de la vue spectateur, **mesuré** : la colonne de gauche entre le bandeau de statuts et
 * le pied de page. C'est lui qui porte l'incrustation de la caméra outil, et c'est sa largeur dont
 * l'incrustation prend 30 %.
 */
export const SPECTATOR_COLUMN: Rect = { x: 0, y: 89, w: 800, h: 862 };

/**
 * Corps du panneau « Perception » à agrandir : l'image que reçoit le détecteur et les cinq lignes
 * qui portent la décision (détecteur, boîtes, inférence, porte, contours). Le paragraphe explicatif
 * et le bouton sont laissés dehors : le sous-titre anglais dit déjà ce qu'ils disent, et les garder
 * coûterait de l'agrandissement là où il sert.
 */
export const PERCEPTION_ZOOM: Rect = { x: 806, y: 516, w: 474, h: 334 };

/**
 * Écran partagé du mûrissement : la scène à gauche, le panneau « Perception » à droite, tous deux
 * **en lecture**, du début du mûrissement jusqu'au réveil.
 *
 * Les deux rectangles sont **mesurés** sur une image extraite de la prise `detection` en 1920×1080,
 * contrôles masqués (`h` pressé dès la première étape du scénario, vérifié sur l'image : aucun
 * bouton de tournage à l'écran) :
 *
 * - `SPECTATOR_LIVE` prend la colonne spectateur sous les deux rangées de statuts (elles s'arrêtent
 *   à y 84) et s'arrête juste avant le pied de page, dont `PROTECTED.blockDiagram` fixe le haut à
 *   y 951 : le recadrage descend donc à y 950, et le test le vérifie contre cette zone plutôt que
 *   contre un nombre recopié. Le bandeau de réveil « Tomate 1 mûre détectée … le serveur réveille
 *   l'agent » vit à y 125-167 : il est dedans, et c'est lui qui montre le réveil à la fin ;
 * - `PERCEPTION_LIVE` s'arrête à x 1164, juste avant la pastille « YOLOv8n ONNX 640 » du coin haut
 *   droit du panneau (x 1164–1268) : la couper en deux se verrait. Tout ce qui porte la décision
 *   reste dedans — l'image d'entrée annotée (x 936–1145) et les cinq lignes `détecteur`, `boîtes`,
 *   `inférence`, `porte`, `contours`, dont la plus longue s'arrête à x 1088.
 *
 * Le partage 55 / 45 agrandit le panneau 2,3 fois et la scène 1,1 fois : c'est le panneau qu'on
 * vient lire, et la scène n'a besoin que de montrer une tomate qui rougit.
 */
export const SPECTATOR_LIVE: Rect = { x: 0, y: 84, w: 800, h: 866 };
export const PERCEPTION_LIVE: Rect = { x: 806, y: 496, w: 358, h: 352 };

export const RIPENING_SPLIT: SplitSpec = {
  left: SPECTATOR_LIVE,
  right: PERCEPTION_LIVE,
  leftRatio: 0.55,
  title: 'What the model sees, live',
};

/**
 * La ligne « top X → droite, Y → haut » / « side Y → droite, Z → haut » sous la rangée de vignettes
 * de vues, **mesurée** sur la prise `cycle` : elle vit à y 932, et la vignette du terminal de la
 * v2 s'arrêtait à 940 — elle effleurait donc ces deux étiquettes. Elle est déclarée protégée pour
 * que le test de géométrie le voie, au lieu qu'une relecture d'image le voie à notre place.
 */
const VIEW_THUMB_LABELS: Rect = { x: 1288, y: 930, w: 632, h: 24 };

/** Hauteur de l'étiquette « caméra outil », mesurée juste au-dessus de l'incrustation. */
const TOOL_CAM_LABEL_H = 18;

/**
 * Le bandeau de sous-titre dans son cas le plus large : `lines` lignes pleines, marge comprise.
 * La boîte réelle épouse le texte ; celle-ci est la borne, c'est elle qu'on tient à l'écart.
 */
export function captionBand(captionWidth: number, lines: number = CAPTION_MAX_LINES): Rect {
  const h = bandHeight(DEFAULT_STYLE, lines);
  return {
    x: DEFAULT_STYLE.captionX - DEFAULT_STYLE.bandPadding,
    y: 1080 - DEFAULT_STYLE.captionBottom - h,
    w: captionWidth + 2 * DEFAULT_STYLE.bandPadding,
    h,
  };
}

/**
 * Largeur du sous-titre tant que l'incrustation de la caméra outil est allumée.
 *
 * Le bandeau habituel part de x 6 et court jusqu'à x 802 : il passe **sous** l'incrustation, qui
 * commence à x 548. Ce n'est pas un réglage de goût, c'est une collision — le sous-titre effacerait
 * précisément le plan que la caméra outil vient montrer. La largeur retenue n'est donc pas choisie
 * mais déduite : le bandeau s'arrête une marge avant le bord gauche de l'incrustation, et le bas
 * gauche de la colonne spectateur, lui, reste libre comme avant.
 */
export const TOOL_CAM_CAPTION_WIDTH = ZONE.toolCamera.x - DEFAULT_STYLE.captionX - 2 * DEFAULT_STYLE.bandPadding;

/** À étaler dans tout segment joué pendant que l'incrustation de la caméra outil est allumée. */
export const TOOL_CAM_CAPTION = { captionWidth: TOOL_CAM_CAPTION_WIDTH } as const;

/**
 * Ce qu'une incrustation ne doit jamais couvrir. `blockActivity` est l'étiquette « agent → server :
 * … » qui vit tout en bas à droite, au-dessus du schéma bloc : elle est petite, facile à oublier, et
 * c'est elle qui dit ce qui vient de passer sur le bus.
 *
 * `toolCamera` est l'incrustation de la caméra outil **et son étiquette**, 18 px au-dessus. Elle ne
 * se défend pas seulement des vignettes : le bandeau de sous-titre de largeur normale la recouvre
 * aussi, et c'est pour cela que les segments joués pendant qu'elle est allumée portent
 * `TOOL_CAM_CAPTION`. Les deux zones se chevauchent donc volontairement dans cette liste :
 * `captionBand` est la borne du bandeau habituel, `toolCamera` ce qu'il doit céder.
 */
export const PROTECTED = {
  statusBar: { x: 0, y: 0, w: 1920, h: 84 },
  trace: ZONE.trace,
  rawSession: ZONE.rawSession,
  featuredView: ZONE.featuredView,
  /** Le pied de page entier, mesuré : les cinq blocs, leurs flèches et la légende. */
  blockDiagram: { x: 0, y: 951, w: 1920, h: 129 },
  blockActivity: { x: 1450, y: 950, w: 470, h: 30 },
  viewThumbLabels: VIEW_THUMB_LABELS,
  captionBand: captionBand(DEFAULT_STYLE.captionWidth),
  toolCamera: {
    x: ZONE.toolCamera.x,
    y: ZONE.toolCamera.y - TOOL_CAM_LABEL_H,
    w: ZONE.toolCamera.w,
    h: ZONE.toolCamera.h + TOOL_CAM_LABEL_H,
  },
} as const satisfies Record<string, Rect>;

/**
 * Incrustations de la capture du terminal (page filmée en 960×600). Deux intentions différentes,
 * et deux règles différentes.
 *
 * `corner` est une **vignette** : elle accompagne la partie 2 sans jamais l'interrompre, donc elle
 * ne doit recouvrir aucune zone protégée. Elle occupe la rangée des vignettes de vues, la seule
 * bande de l'écran dont l'information est redondante — la vue mise en avant, juste au-dessus, porte
 * déjà tout, et la partie 1 a montré les trois vues en plein écran. Elle s'arrêtait à y 940, ce qui
 * était huit pixels de trop : les étiquettes « top … » et « side … » des vignettes commencent à
 * y 932 et la vignette les effleurait. Elle s'arrête maintenant à y 928. Comme la bande est large et basse,
 * l'incrustation est mise à la largeur voulue puis rognée par le bas (`fit: 'bottom'`) : on voit les
 * dernières lignes de la console à une échelle où elles se lisent, au lieu de la page entière
 * réduite à l'illisible.
 *
 * `half` est une **prise de parole** : un carton l'annonce, le terminal devient le sujet et occupe
 * la moitié droite de l'écran, presque à l'échelle 1, le temps d'un segment de la partie 1. Elle
 * couvre donc volontairement la trace et la vue mise en avant. Elle laisse en revanche le bandeau
 * de sous-titre libre, parce que c'est lui qui dit ce qu'on regarde.
 */
export const PIP = {
  corner: { x: 1290, y: 760, w: 610, h: 168, fit: 'bottom' },
  half: { x: 976, y: 236, w: 912, h: 570 },
} as const satisfies Record<string, PipSpec>;

/**
 * Cadre bleu posé sur la tuile de l'étape, dans l'écran de traitement des vues (touche `x`).
 *
 * Recalé sur la grille réelle livrée par l'issue #36, **mesurée** sur la page en 1920×1080
 * (`getBoundingClientRect` de chaque `[data-testid="pipeline-tile"]`, prise `pipeline` du
 * 2026-09-18) : `PipelinePanel` pose ses dix tuiles en **deux rangées de cinq** (`xl:grid-cols-5`),
 * à x = 16 + 380 c et y = 56 + 508 r, chacune de 368 × 496. Le cadre est posé deux pixels en dehors
 * de la bordure de la tuile, pour se détacher de son fond sombre sans mordre sur la voisine.
 */
const TILE = { x0: 14, y0: 54, dx: 380, dy: 508, w: 372, h: 500 } as const;

export function pipelineTile(i: number): Rect {
  const column = i % 5;
  const row = Math.floor(i / 5);
  return { x: TILE.x0 + column * TILE.dx, y: TILE.y0 + row * TILE.dy, w: TILE.w, h: TILE.h };
}
