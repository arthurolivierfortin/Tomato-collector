/**
 * Agrandissement d'une zone de l'image : prendre un moment sur une tuile, montrer ce que le modèle
 * voit et ce qu'il en sort.
 *
 * L'écran de traitement des vues range dix tuiles de 368 × 496 dans 1920 × 1080 : à l'échelle du
 * film, le texte d'une tuile fait quatre pixels de haut et personne ne le lit. Un arrêt sur image
 * qui porte un `zoom` recadre donc la tuile, l'agrandit jusqu'à 85 % de la hauteur de l'image
 * (`lanczos`, pas de crénelage), la pose sur un fond sombre, et écrit à côté d'elle les trois
 * éléments qui comptent : ce qui entre, ce qui fait le travail, ce qui sort.
 *
 * Tout est pur : la géométrie et les chaînes de filtres se calculent et se testent sans ffmpeg.
 */
import { chain, drawtextFilter, escapeFilterPath } from './ffmpegFilters';
import type { Format, Rect, TextStyle } from './style';

/** Ce qu'un agrandissement montre : la zone à recadrer, et les trois éléments qui la commentent. */
export interface ZoomSpec {
  /** Rectangle de la prise à recadrer, en pixels de l'image de sortie (une tuile du pipeline). */
  readonly source: Rect;
  /** Ce qui entre dans l'étape. */
  readonly input: string;
  /** Qui fait le travail : modèle, bibliothèque, calibration, état du robot, simulation, géométrie. */
  readonly by: string;
  /** Ce qui en sort. */
  readonly output: string;
}

/** Les trois éléments du sous-titre, préfixés. Un seul endroit les écrit : textes gravés et rendu. */
export function zoomLines(zoom: ZoomSpec): string[] {
  return [`Input: ${zoom.input}`, `Done by: ${zoom.by}`, `Output: ${zoom.output}`];
}

export interface ZoomOptions {
  /** Part de la hauteur de l'image occupée par la tuile agrandie. */
  readonly heightRatio: number;
  /** Marge extérieure, à gauche de la tuile et à droite du texte. */
  readonly margin: number;
  /** Espace entre la tuile agrandie et la colonne de texte. */
  readonly gap: number;
  /** Largeur minimale laissée au texte : la tuile rétrécit plutôt que de l'étouffer. */
  readonly minTextWidth: number;
}

/**
 * 85 % de la hauteur : une tuile de 372 × 500 devient 684 × 918, soit un facteur 1,84. Le texte
 * garde alors plus de mille pixels à droite, de quoi écrire les trois éléments en gros corps.
 */
export const ZOOM: ZoomOptions = { heightRatio: 0.85, margin: 64, gap: 48, minTextWidth: 760 };

export interface ZoomLayout {
  /** Zone recadrée, ramenée dans les bornes de l'image. */
  readonly crop: Rect;
  /** Taille de la tuile agrandie, toujours paire (yuv420p n'aime pas les dimensions impaires). */
  readonly scaled: { readonly w: number; readonly h: number };
  /** Coin haut-gauche de la tuile agrandie dans l'image de sortie. */
  readonly at: { readonly x: number; readonly y: number };
  /** Colonne de texte, à droite de la tuile : jamais dessus. */
  readonly textX: number;
  readonly textWidth: number;
  /** Milieu vertical de l'image : la pile de textes est centrée dessus. */
  readonly centerY: number;
}

function even(n: number): number {
  return 2 * Math.round(n / 2);
}

function clampCrop(source: Rect, format: Format): Rect {
  const x = Math.min(Math.max(0, Math.round(source.x)), format.width - 2);
  const y = Math.min(Math.max(0, Math.round(source.y)), format.height - 2);
  return { x, y, w: Math.min(Math.round(source.w), format.width - x), h: Math.min(Math.round(source.h), format.height - y) };
}

/**
 * Géométrie de l'agrandissement. La tuile est mise à `heightRatio` de la hauteur, puis rabotée si
 * elle ne laisse plus `minTextWidth` au texte — une tuile large ne doit pas chasser les légendes.
 */
export function zoomLayout(source: Rect, format: Format, opts: ZoomOptions = ZOOM): ZoomLayout {
  const crop = clampCrop(source, format);
  const maxW = format.width - 2 * opts.margin - opts.gap - opts.minTextWidth;
  const byHeight = format.height * opts.heightRatio;
  const factor = Math.min(byHeight / crop.h, maxW / crop.w);
  const scaled = { w: even(crop.w * factor), h: even(crop.h * factor) };
  const at = { x: opts.margin, y: Math.round((format.height - scaled.h) / 2) };
  const textX = at.x + scaled.w + opts.gap;
  return { crop, scaled, at, textX, textWidth: format.width - opts.margin - textX, centerY: format.height / 2 };
}

/** Hauteur d'une ligne de texte gravé : le même interligne aéré que les sous-titres. */
export function textLineHeight(size: number): number {
  return Math.round(size * 1.45);
}

/** Nombre de caractères tenant dans une colonne de `width` pixels, au corps demandé. */
export function zoomWrapChars(width: number, size: number): number {
  return Math.max(12, Math.floor((width - 32) / (size * 0.44)));
}

/**
 * Empile des blocs de texte centrés sur `centerY` : rend le haut de chaque bloc. Séparé du rendu
 * parce que c'est là qu'un bloc peut en recouvrir un autre, et que ça se teste sans ffmpeg.
 */
export function stackTops(heights: readonly number[], gap: number, centerY: number): number[] {
  const total = heights.reduce((s, h) => s + h, 0) + gap * Math.max(0, heights.length - 1);
  let y = Math.round(centerY - total / 2);
  return heights.map((h) => {
    const top = y;
    y += h + gap;
    return top;
  });
}

/** Un bloc de texte de l'agrandissement : son fichier UTF-8, son nombre de lignes, son corps. */
export interface ZoomBlock {
  readonly file: string;
  readonly lines: number;
  readonly size: number;
  readonly color: string;
}

/** Espace entre deux blocs de la colonne de texte. */
export const ZOOM_BLOCK_GAP = 22;

export function zoomBlockHeight(block: ZoomBlock): number {
  return block.lines * textLineHeight(block.size);
}

/**
 * Chaîne de filtres d'un agrandissement : recadrage, mise à l'échelle lisse, fond sombre, liseré de
 * la couleur des cadres (le spectateur vient de le voir autour de la tuile), puis la colonne de
 * texte, puis un fondu d'entrée et de sortie. `format=yuv420p` reste en dernier.
 */
export function zoomFilters(
  layout: ZoomLayout,
  blocks: readonly ZoomBlock[],
  style: TextStyle,
  format: Format,
  background: string,
  durationS: number,
): string[] {
  const { crop, scaled, at } = layout;
  const border = style.highlightThickness;
  const tops = stackTops(blocks.map(zoomBlockHeight), ZOOM_BLOCK_GAP, layout.centerY);
  const texts = blocks.map((block, i) =>
    drawtextFilter('L', [
      `fontfile=${escapeFilterPath(style.fontFile)}`,
      `textfile=${escapeFilterPath(block.file)}`,
      `fontsize=${block.size}`,
      `fontcolor=${block.color}`,
      'shadowcolor=black@0.85',
      'shadowx=2',
      'shadowy=2',
      `x=${layout.textX}`,
      `y=${tops[i] ?? 0}`,
      `line_spacing=${textLineHeight(block.size) - block.size}`,
    ]),
  );
  const fade = style.captionFadeS;
  const out = durationS > 2 * fade ? [`fade=t=out:st=${(durationS - fade).toFixed(2)}:d=${fade}`] : [];
  return [
    `crop=${crop.w}:${crop.h}:${crop.x}:${crop.y}`,
    `scale=${scaled.w}:${scaled.h}:flags=lanczos`,
    `pad=${format.width}:${format.height}:${at.x}:${at.y}:color=${background}`,
    'setsar=1',
    `drawbox=x=${at.x - border}:y=${at.y - border}:w=${scaled.w + 2 * border}:h=${scaled.h + 2 * border}:color=${style.highlightColor}:t=${border}`,
    ...texts,
    `fade=t=in:st=0:d=${fade}`,
    ...out,
    'format=yuv420p',
  ];
}

/** La chaîne complète, prête pour `-vf`. */
export function zoomChain(
  layout: ZoomLayout,
  blocks: readonly ZoomBlock[],
  style: TextStyle,
  format: Format,
  background: string,
  durationS: number,
): string {
  return chain(zoomFilters(layout, blocks, style, format, background, durationS));
}
