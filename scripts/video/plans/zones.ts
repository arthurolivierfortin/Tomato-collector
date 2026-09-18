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
} as const satisfies Record<string, Rect>;

/**
 * Corps du panneau « Perception » à agrandir : l'image que reçoit le détecteur et les cinq lignes
 * qui portent la décision (détecteur, boîtes, inférence, porte, contours). Le paragraphe explicatif
 * et le bouton sont laissés dehors : le sous-titre anglais dit déjà ce qu'ils disent, et les garder
 * coûterait de l'agrandissement là où il sert.
 */
export const PERCEPTION_ZOOM: Rect = { x: 806, y: 516, w: 474, h: 334 };

/**
 * La ligne « top X → droite, Y → haut » / « side Y → droite, Z → haut » sous la rangée de vignettes
 * de vues, **mesurée** sur la prise `cycle` : elle vit à y 932, et la vignette du terminal de la
 * v2 s'arrêtait à 940 — elle effleurait donc ces deux étiquettes. Elle est déclarée protégée pour
 * que le test de géométrie le voie, au lieu qu'une relecture d'image le voie à notre place.
 */
const VIEW_THUMB_LABELS: Rect = { x: 1288, y: 930, w: 632, h: 24 };

/** Le bandeau de sous-titre dans son cas le plus large : deux lignes, toute la largeur de rupture. */
const CAPTION_BAND: Rect = {
  x: DEFAULT_STYLE.captionX - DEFAULT_STYLE.bandPadding,
  y: 1080 - DEFAULT_STYLE.captionBottom - bandHeight(DEFAULT_STYLE, CAPTION_MAX_LINES),
  w: DEFAULT_STYLE.captionWidth + 2 * DEFAULT_STYLE.bandPadding,
  h: bandHeight(DEFAULT_STYLE, CAPTION_MAX_LINES),
};

/**
 * Ce qu'une incrustation ne doit jamais couvrir. `blockActivity` est l'étiquette « agent → server :
 * … » qui vit tout en bas à droite, au-dessus du schéma bloc : elle est petite, facile à oublier, et
 * c'est elle qui dit ce qui vient de passer sur le bus.
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
  captionBand: CAPTION_BAND,
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
