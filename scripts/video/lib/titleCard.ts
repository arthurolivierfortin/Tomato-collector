/**
 * Carton de signature : le titre du projet en grand, la ligne d'auteur dessous, un sous-texte
 * facultatif en petit, et un fondu au noir en entrée comme en sortie.
 *
 * Les cartons ordinaires (`titleFilters` dans `ffmpegFilters.ts`) centrent leur texte avec
 * `(h-text_h)/2`, c'est-à-dire qu'ils laissent ffmpeg placer les deux blocs. Trois blocs de corps
 * différents ne se placent plus comme ça : la pile se calcule ici, en pixels, et se teste sans
 * lancer ffmpeg. C'est aussi ce qui permet d'affirmer que rien ne déborde de l'image.
 *
 * Tout est pur : géométrie et chaînes de filtres, aucun process lancé.
 */
import { drawtextFilter, escapeFilterPath } from './ffmpegFilters';
import type { Format, TextStyle } from './style';

/** Ce qu'un carton de signature porte : le titre, la ligne d'auteur, un sous-texte facultatif. */
export interface SignatureSpec {
  readonly title: string;
  readonly byline: string;
  readonly subtext?: string;
}

export interface SignatureOptions {
  readonly titleSize: number;
  readonly bylineSize: number;
  readonly subtextSize: number;
  readonly titleColor: string;
  readonly bylineColor: string;
  readonly subtextColor: string;
  /** Espace entre le titre et la ligne d'auteur, en pixels. */
  readonly gapAfterTitle: number;
  /** Espace entre la ligne d'auteur et le sous-texte, en pixels. */
  readonly gapAfterByline: number;
  /** Hauteur d'un bloc d'une ligne : le corps multiplié par ce facteur. */
  readonly lineFactor: number;
}

/**
 * 88 px pour le titre : le carton d'ouverture n'a rien d'autre à montrer, il peut être plus grand
 * que les cartons de section (64 px). 44 px pour la ligne d'auteur, assez pour se lire de loin sans
 * concurrencer le titre, et 30 px pour le sous-texte, le corps des sous-titres du film.
 */
export const SIGNATURE: SignatureOptions = {
  titleSize: 88,
  bylineSize: 44,
  subtextSize: 30,
  titleColor: 'white',
  bylineColor: 'white',
  subtextColor: '0xB9C2D0',
  gapAfterTitle: 26,
  gapAfterByline: 30,
  lineFactor: 1.3,
};

/** Un bloc de texte du carton : ce qu'il dit, son corps, sa couleur, et où il commence. */
export interface CardBlock {
  readonly key: 'title' | 'byline' | 'subtext';
  readonly text: string;
  readonly size: number;
  readonly color: string;
  /** Ordonnée du haut du bloc dans l'image de sortie, en pixels. */
  readonly y: number;
  readonly height: number;
}

/** Un bloc prêt à graver : son texte est déjà dans un fichier UTF-8, comme partout ailleurs. */
export interface PlacedText {
  readonly file: string;
  readonly size: number;
  readonly color: string;
  readonly y: number;
}

/**
 * La pile du carton, centrée verticalement : titre, ligne d'auteur, sous-texte s'il y en a un.
 * Chaque bloc tient sur une ligne ; les textes du plan sont courts, et `demo.test.ts` le vérifie.
 */
export function signatureBlocks(spec: SignatureSpec, format: Format, opts: SignatureOptions = SIGNATURE): CardBlock[] {
  const height = (size: number): number => Math.round(size * opts.lineFactor);
  const parts: { key: CardBlock['key']; text: string; size: number; color: string; gapBefore: number }[] = [
    { key: 'title', text: spec.title, size: opts.titleSize, color: opts.titleColor, gapBefore: 0 },
    { key: 'byline', text: spec.byline, size: opts.bylineSize, color: opts.bylineColor, gapBefore: opts.gapAfterTitle },
    ...(spec.subtext === undefined
      ? []
      : [{ key: 'subtext' as const, text: spec.subtext, size: opts.subtextSize, color: opts.subtextColor, gapBefore: opts.gapAfterByline }]),
  ];
  const total = parts.reduce((sum, p) => sum + p.gapBefore + height(p.size), 0);
  let cursor = Math.round((format.height - total) / 2);
  const blocks: CardBlock[] = [];
  for (const part of parts) {
    cursor += part.gapBefore;
    blocks.push({ key: part.key, text: part.text, size: part.size, color: part.color, y: cursor, height: height(part.size) });
    cursor += height(part.size);
  }
  return blocks;
}

/**
 * Un `drawtext` par bloc : centré horizontalement, posé à l'ordonnée calculée. `expansion=none` et
 * `textfile=` sont obligatoires ici comme ailleurs (accents, `%`), et l'ordonnée est un nombre, pas
 * une expression : c'est la pile qui décide, pas ffmpeg.
 */
export function signatureCardFilters(blocks: readonly PlacedText[], style: TextStyle): string[] {
  return blocks.map((block) =>
    drawtextFilter('C', [
      `fontfile=${escapeFilterPath(style.fontFile)}`,
      `textfile=${escapeFilterPath(block.file)}`,
      `fontsize=${block.size}`,
      `fontcolor=${block.color}`,
      'shadowcolor=black@0.85',
      'shadowx=2',
      'shadowy=2',
      'x=(w-text_w)/2',
      `y=${block.y}`,
    ]),
  );
}

/**
 * Fondu au noir, en entrée et en sortie. Rien n'est posé si le carton est trop court pour les deux :
 * un fondu qui mord sur l'autre donne un carton qui n'atteint jamais sa pleine intensité.
 */
export function fadeFilters(durationS: number, fadeS: number): string[] {
  if (fadeS <= 0 || durationS <= 2 * fadeS) return [];
  return [`fade=t=in:st=0:d=${fadeS.toFixed(2)}:color=black`, `fade=t=out:st=${(durationS - fadeS).toFixed(2)}:d=${fadeS.toFixed(2)}:color=black`];
}
