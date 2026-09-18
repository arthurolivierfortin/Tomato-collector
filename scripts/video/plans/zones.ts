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

export const ZONE = {
  ripening: { x: 568, y: 4, w: 244, h: 36 },
  wakeBanner: { x: 8, y: 124, w: 786, h: 46 },
  blockDiagram: { x: 476, y: 980, w: 968, h: 96 },
  trace: { x: 800, y: 90, w: 484, h: 300 },
  rawSession: { x: 800, y: 526, w: 484, h: 272 },
  featuredView: { x: 1286, y: 116, w: 626, h: 636 },
} as const satisfies Record<string, Rect>;

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
  featuredView: ZONE.featuredView,
  blockDiagram: ZONE.blockDiagram,
  blockActivity: { x: 1450, y: 950, w: 470, h: 30 },
  captionBand: CAPTION_BAND,
} as const satisfies Record<string, Rect>;

/**
 * Incrustations de la capture du terminal (page filmée en 960×600). Deux intentions différentes,
 * et deux règles différentes.
 *
 * `corner` est une **vignette** : elle accompagne la partie 2 sans jamais l'interrompre, donc elle
 * ne doit recouvrir aucune zone protégée. Elle occupe la rangée des vignettes de vues, la seule
 * bande de l'écran dont l'information est redondante — la vue mise en avant, juste au-dessus, porte
 * déjà tout, et la partie 1 a montré les trois vues en plein écran. Elle s'arrête à y 940, dix
 * pixels au-dessus de l'étiquette d'activité du schéma bloc. Comme la bande est large et basse,
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
  corner: { x: 1290, y: 760, w: 610, h: 180, fit: 'bottom' },
  half: { x: 976, y: 236, w: 912, h: 570 },
} as const satisfies Record<string, PipSpec>;

/**
 * Cadre bleu posé sur la tuile de l'étape, dans l'écran de traitement des vues (touche `x`).
 * **À recaler sur la première prise `pipeline`** : la grille est celle que l'issue #36 annonce
 * (quatre tuiles par rangée, deux rangées), les pixels exacts ne seront connus qu'une fois l'écran
 * à l'image. Les segments qui s'en servent sont `optional` : rien n'est monté tant que la prise ne
 * pose pas les marqueurs.
 */
export function pipelineTile(i: number): Rect {
  const column = i % 4;
  const row = Math.floor(i / 4);
  return { x: 24 + column * 472, y: 150 + row * 440, w: 448, h: 416 };
}
