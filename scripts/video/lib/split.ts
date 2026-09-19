/**
 * Écran partagé : deux endroits de la même image, côte à côte, agrandis, pendant toute la lecture.
 *
 * Un agrandissement (`zoom.ts`) est un arrêt sur image : il fige la prise pour rendre une zone
 * lisible. Le propriétaire de la v2.1 a dit ce qui manquait : « la vue du modèle qui sait quand une
 * tomate est prête ou non apparaît seulement une fois une tomate détectée ; on devrait la voir
 * avant, pour voir que le modèle détecte la tomate qui est prête. » Un arrêt sur image ne peut pas
 * montrer ça : ce qu'il faut voir, c'est la tomate qui rougit **et**, au même instant, les boîtes du
 * détecteur qui changent. Deux endroits de l'image, en mouvement, en même temps.
 *
 * D'où l'écran partagé : la colonne spectateur à gauche, le panneau « Perception » à droite,
 * recadrés et mis à l'échelle de leur volet, assemblés par `hstack`, avec une bande de titre en
 * haut. Le panneau, qui fait 358 × 352 dans une image de 1920 × 1080, est agrandi 2,3 fois : les
 * lignes « boîtes 1 ripe · 8 unripe » et « porte 1/5 frames consécutives » se lisent pendant la
 * lecture, plus seulement à l'arrêt.
 *
 * Tout est pur : la géométrie et les chaînes de filtres se calculent et se testent sans ffmpeg.
 */
import { chain, drawtextFilter, escapeFilterPath } from './ffmpegFilters';
import type { Format, Rect, TextStyle } from './style';

/** Ce qu'un écran partagé montre : deux rectangles de la prise, leur partage, et son titre. */
export interface SplitSpec {
  /** Rectangle du volet de gauche, en pixels de la prise (la colonne spectateur). */
  readonly left: Rect;
  /** Rectangle du volet de droite, en pixels de la prise (le panneau « Perception »). */
  readonly right: Rect;
  /** Part de la largeur donnée au volet de gauche (0,55 : la scène garde la majorité). */
  readonly leftRatio: number;
  /** Titre discret de la bande du haut, en anglais comme tout ce que le montage grave. */
  readonly title: string;
}

export interface SplitOptions {
  /** Hauteur de la bande de titre, en haut de l'image. */
  readonly titleHeight: number;
  /** Corps du titre : discret, il ne doit pas concurrencer le sous-titre. */
  readonly titleSize: number;
  readonly titleColor: string;
  /** Marge intérieure d'un volet : l'image agrandie ne touche ni le bord ni sa voisine. */
  readonly padding: number;
}

/**
 * 76 px de bande de titre : assez pour un corps 30 avec de l'air, assez peu pour que les deux
 * volets gardent 1004 px de haut, soit 93 % de l'image.
 */
export const SPLIT: SplitOptions = { titleHeight: 76, titleSize: 30, titleColor: '0xB9C2D0', padding: 14 };

/** Un volet : son rectangle dans l'image de sortie, et l'image agrandie qui vit dedans. */
export interface PaneLayout {
  /** Zone recadrée dans la prise, ramenée dans les bornes de l'image. */
  readonly crop: Rect;
  /** Taille de l'image agrandie, toujours paire (yuv420p refuse les dimensions impaires). */
  readonly scaled: { readonly w: number; readonly h: number };
  /** Le volet lui-même, en coordonnées de l'image de sortie. */
  readonly pane: Rect;
  /** Coin haut-gauche de l'image agrandie, en coordonnées de l'image de sortie. */
  readonly at: { readonly x: number; readonly y: number };
  /** Le même coin, relatif au volet : c'est ce que `pad` attend. */
  readonly offset: { readonly x: number; readonly y: number };
}

export interface SplitLayout {
  readonly left: PaneLayout;
  readonly right: PaneLayout;
  readonly titleHeight: number;
  readonly contentHeight: number;
  readonly title: string;
}

function even(n: number): number {
  return 2 * Math.round(n / 2);
}

function clampCrop(source: Rect, format: Format): Rect {
  const x = Math.min(Math.max(0, Math.round(source.x)), format.width - 2);
  const y = Math.min(Math.max(0, Math.round(source.y)), format.height - 2);
  return {
    x,
    y,
    w: Math.min(Math.round(source.w), format.width - x),
    h: Math.min(Math.round(source.h), format.height - y),
  };
}

/**
 * Un volet : la source recadrée, mise à l'échelle sans déformation, centrée en hauteur et **collée
 * au bord extérieur** en largeur. Centrer horizontalement serait plus joli tout seul, mais le
 * bandeau de sous-titre est posé à `captionX` du bord gauche de l'image, comme partout ailleurs
 * dans le film : il faut donc que l'image de gauche commence au bord, sinon le bandeau déborde à sa
 * gauche, sur le fond. Le jeu qui reste part au milieu, où il sépare les deux volets.
 */
function pane(source: Rect, box: Rect, format: Format, opts: SplitOptions, side: 'left' | 'right'): PaneLayout {
  const crop = clampCrop(source, format);
  const innerW = box.w - 2 * opts.padding;
  const innerH = box.h - 2 * opts.padding;
  const factor = Math.min(innerW / crop.w, innerH / crop.h);
  const scaled = { w: even(crop.w * factor), h: even(crop.h * factor) };
  // À gauche, l'image touche le bord de l'écran ; à droite, elle garde la marge de son liseré.
  const offset = { x: side === 'left' ? 0 : box.w - opts.padding - scaled.w, y: Math.round((box.h - scaled.h) / 2) };
  return { crop, scaled, pane: box, at: { x: box.x + offset.x, y: box.y + offset.y }, offset };
}

/**
 * Géométrie de l'écran partagé. La bande de titre est prise en haut, le reste est coupé en deux
 * selon `leftRatio`, et chaque source est mise à l'échelle de son volet, marge comprise. Les
 * largeurs sont paires : `hstack` recolle deux volets, et un pixel impair au milieu se voit.
 */
export function splitLayout(spec: SplitSpec, format: Format, opts: SplitOptions = SPLIT): SplitLayout {
  const contentHeight = format.height - opts.titleHeight;
  const leftW = even(format.width * spec.leftRatio);
  const rightW = format.width - leftW;
  const y = opts.titleHeight;
  return {
    left: pane(spec.left, { x: 0, y, w: leftW, h: contentHeight }, format, opts, 'left'),
    right: pane(spec.right, { x: leftW, y, w: rightW, h: contentHeight }, format, opts, 'right'),
    titleHeight: opts.titleHeight,
    contentHeight,
    title: spec.title,
  };
}

/** La chaîne de filtres d'un volet : recadrage, agrandissement lisse, puis fond du volet autour. */
function paneChain(p: PaneLayout, background: string): string {
  return chain([
    `crop=${p.crop.w}:${p.crop.h}:${p.crop.x}:${p.crop.y}`,
    `scale=${p.scaled.w}:${p.scaled.h}:flags=lanczos`,
    `pad=${p.pane.w}:${p.pane.h}:${p.offset.x}:${p.offset.y}:color=${background}`,
    'setsar=1',
  ]);
}

/** Le titre de la bande du haut, centré dessus : discret, c'est le sous-titre qui parle. */
function titleFilter(layout: SplitLayout, style: TextStyle, titleFile: string, opts: SplitOptions): string {
  return drawtextFilter('C', [
    `fontfile=${escapeFilterPath(style.fontFile)}`,
    `textfile=${escapeFilterPath(titleFile)}`,
    `fontsize=${opts.titleSize}`,
    `fontcolor=${opts.titleColor}`,
    'shadowcolor=black@0.85',
    'shadowx=2',
    'shadowy=2',
    'x=(w-text_w)/2',
    `y=(${layout.titleHeight}-text_h)/2`,
  ]);
}

/**
 * Le graphe, branche par branche : la source dédoublée, un volet par branche, l'assemblage, la
 * bande de titre, le liseré du panneau et les textes.
 *
 * Le liseré bleu ne va qu'autour du volet de droite : c'est lui qui répond à la question posée par
 * le titre, et le spectateur connaît déjà cette couleur, c'est celle des cadres du reste du film.
 * `format=yuv420p` reste en dernier, après les sous-titres.
 */
export function splitFilters(
  layout: SplitLayout,
  style: TextStyle,
  background: string,
  titleFile: string,
  overlays: readonly string[],
  opts: SplitOptions = SPLIT,
): string[] {
  const t = style.highlightThickness;
  const r = layout.right;
  return [
    '[0:v]split=2[spl][spr]',
    `[spl]${paneChain(layout.left, background)}[panel]`,
    `[spr]${paneChain(layout.right, background)}[paner]`,
    '[panel][paner]hstack=inputs=2[row]',
    `[row]pad=${layout.left.pane.w + layout.right.pane.w}:${layout.titleHeight + layout.contentHeight}:0:${layout.titleHeight}:color=${background},setsar=1[canvas]`,
    `[canvas]${chain([
      `drawbox=x=${r.at.x - t}:y=${r.at.y - t}:w=${r.scaled.w + 2 * t}:h=${r.scaled.h + 2 * t}:color=${style.highlightColor}:t=${t}`,
      titleFilter(layout, style, titleFile, opts),
      ...overlays,
      'format=yuv420p',
    ])}[out]`,
  ];
}

/** Le graphe complet, prêt pour `-filter_complex` avec `-map [out]`. */
export function splitComplex(
  layout: SplitLayout,
  style: TextStyle,
  _format: Format,
  background: string,
  titleFile: string,
  overlays: readonly string[],
  opts: SplitOptions = SPLIT,
): string {
  return splitFilters(layout, style, background, titleFile, overlays, opts).join(';');
}
