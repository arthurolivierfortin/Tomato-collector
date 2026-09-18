/**
 * Construction des chaînes de filtres ffmpeg. Tout est pur : aucun process n'est lancé ici, les
 * tests unitaires comparent des chaînes. `ffmpegRun.ts` s'occupe de l'exécution.
 *
 * Échappement sous Windows : un chemin absolu contient `C:\…`, or `:` sépare les options d'un
 * filtre et `\` échappe. On passe donc par `escapeFilterPath` (slashs, `\:`, apostrophes) et les
 * textes accentués passent par `textfile=` (fichier UTF-8) plutôt que par `text=`.
 */

export interface TextStyle {
  /** Chemin système de la police (Segoe UI sous Windows, DejaVu Sans ailleurs). */
  readonly fontFile: string;
  readonly titleSize: number;
  readonly subtitleSize: number;
  readonly captionSize: number;
  /** Marge du bandeau de sous-titre au-dessus et en dessous du texte, en pixels. */
  readonly bandPadding: number;
  /** Distance entre le bord de l'image et le bandeau, en pixels. */
  readonly bandMargin: number;
  readonly bandOpacity: number;
  readonly fontColor: string;
}

export const WINDOWS_FONT = 'C:/Windows/Fonts/segoeui.ttf';

export const DEFAULT_STYLE: TextStyle = {
  fontFile: WINDOWS_FONT,
  titleSize: 64,
  subtitleSize: 36,
  captionSize: 38,
  bandPadding: 24,
  bandMargin: 24,
  bandOpacity: 0.72,
  fontColor: 'white',
};

/** Fond des cartons de titre : le même bleu nuit que le dashboard. */
export const TITLE_BACKGROUND = '0x0E1116';

/** Chemin utilisable dans un filtre : slashs, `:` échappé, entouré d'apostrophes. */
export function escapeFilterPath(path: string): string {
  const slashed = path.replace(/\\/g, '/');
  const quoted = slashed.replace(/'/g, "'\\\\''").replace(/:/g, '\\:');
  return `'${quoted}'`;
}

/** Texte passé en ligne à drawtext (`text=`) ; préférer `textfile=` dès qu'il y a des accents. */
export function escapeDrawtextText(text: string): string {
  return text.replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/%/g, '\\%').replace(/:/g, '\\:');
}

export interface Format {
  readonly width: number;
  readonly height: number;
  readonly fps: number;
}

/** Ramène n'importe quelle source au format de sortie sans déformer l'image. */
export function normalizeFilters(format: Format): string[] {
  const { width, height, fps } = format;
  return [
    `scale=${width}:${height}:force_original_aspect_ratio=decrease`,
    `pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2:color=black`,
    `fps=${fps}`,
    'setsar=1',
    'format=yuv420p',
  ];
}

/**
 * `expansion=none` : sans ça drawtext interprète `%` et `{}` comme de la syntaxe (strftime, texte
 * dynamique) et refuse un sous-titre aussi banal que « mûrit 62 % » — « Stray % near … ».
 * `text_align=C` : sans ça les lignes d'un texte sur deux lignes sont collées à gauche du bloc.
 */
function drawtext(parts: readonly string[]): string {
  return `drawtext=${['expansion=none', 'text_align=C', ...parts].join(':')}`;
}

/** Hauteur d'une ligne de sous-titre, interligne compris. */
export function captionLineHeight(style: TextStyle): number {
  return Math.round(style.captionSize * 1.3);
}

/** Hauteur du bandeau pour `lines` lignes : un sous-titre sur deux lignes doit tenir dedans. */
export function bandHeight(style: TextStyle, lines: number): number {
  return Math.max(1, lines) * captionLineHeight(style) + 2 * style.bandPadding;
}

/**
 * Bandeau de sous-titre en bas + le texte centré dedans (deux filtres, dans cet ordre).
 *
 * Deux pièges, tous deux vérifiés : dans `drawbox`, `h` désigne la hauteur de la BOÎTE, il faut
 * `ih` pour celle de l'image ; dans `drawtext`, `ih` n'existe pas et ffmpeg 9 segfault si on
 * l'écrit — c'est `h` qui vaut la hauteur de l'image.
 */
export function captionFilters(textFile: string, style: TextStyle, lines = 1, atTop = false): [string, string] {
  const height = bandHeight(style, lines);
  const boxY = atTop ? String(style.bandMargin) : `ih-${style.bandMargin + height}`;
  const textY = atTop ? String(style.bandMargin + style.bandPadding) : `h-${style.bandMargin + height - style.bandPadding}`;
  const box = `drawbox=x=0:y=${boxY}:w=iw:h=${height}:color=black@${style.bandOpacity}:t=fill`;
  const text = drawtext([
    `fontfile=${escapeFilterPath(style.fontFile)}`,
    `textfile=${escapeFilterPath(textFile)}`,
    `fontsize=${style.captionSize}`,
    `fontcolor=${style.fontColor}`,
    'x=(w-text_w)/2',
    `y=${textY}`,
    `line_spacing=${captionLineHeight(style) - style.captionSize}`,
  ]);
  return [box, text];
}

/** Carton de titre : titre centré, sous-titre optionnel juste dessous. */
export function titleFilters(titleFile: string, subtitleFile: string | null, style: TextStyle): string[] {
  const common = [`fontfile=${escapeFilterPath(style.fontFile)}`, `fontcolor=${style.fontColor}`, 'x=(w-text_w)/2', 'line_spacing=14'];
  if (subtitleFile === null) {
    return [drawtext([...common, `textfile=${escapeFilterPath(titleFile)}`, `fontsize=${style.titleSize}`, 'y=(h-text_h)/2'])];
  }
  return [
    drawtext([...common, `textfile=${escapeFilterPath(titleFile)}`, `fontsize=${style.titleSize}`, 'y=(h-text_h)/2-50']),
    drawtext([
      ...common,
      `textfile=${escapeFilterPath(subtitleFile)}`,
      `fontsize=${style.subtitleSize}`,
      'fontcolor=0xB9C2D0',
      'y=(h-text_h)/2+60',
    ]),
  ];
}

/** Assemble une chaîne de filtres ; `null` est le filtre neutre de ffmpeg, pour une chaîne vide. */
export function chain(filters: readonly string[]): string {
  const kept = filters.filter((f) => f !== '');
  return kept.length === 0 ? 'null' : kept.join(',');
}

/**
 * Coupe un texte en lignes d'au plus `maxChars` caractères : drawtext ne renvoie pas à la ligne
 * tout seul, un sous-titre trop long sortirait de l'image à gauche et à droite.
 */
export function wrapText(text: string, maxChars: number): string {
  const words = text.split(/\s+/).filter((w) => w !== '');
  const lines: string[] = [];
  let current = '';
  for (const word of words) {
    const next = current === '' ? word : `${current} ${word}`;
    if (next.length > maxChars && current !== '') {
      lines.push(current);
      current = word;
    } else current = next;
  }
  if (current !== '') lines.push(current);
  return lines.join('\n');
}

/** Nombre de lignes du texte : sert à hausser le bandeau quand le sous-titre en fait deux. */
export function lineCount(text: string): number {
  return text.split('\n').length;
}
