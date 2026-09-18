/**
 * Construction des chaînes de filtres ffmpeg. Tout est pur : aucun process n'est lancé ici, les
 * tests unitaires comparent des chaînes. `ffmpegRun.ts` s'occupe de l'exécution.
 *
 * Échappement sous Windows : un chemin absolu contient `C:\…`, or `:` sépare les options d'un
 * filtre et `\` échappe. On passe donc par `escapeFilterPath` (slashs, `\:`, apostrophes) et les
 * textes accentués passent par `textfile=` (fichier UTF-8) plutôt que par `text=`.
 */

/** Rectangle en pixels dans l'image de sortie, origine en haut à gauche. */
export interface Rect {
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
}

export interface TextStyle {
  /** Chemin système de la police (Segoe UI sous Windows, DejaVu Sans ailleurs). */
  readonly fontFile: string;
  readonly titleSize: number;
  readonly subtitleSize: number;
  readonly captionSize: number;
  /**
   * Où vit le sous-titre : dans le bas de la colonne spectateur, qui ne porte plus aucune
   * information une fois les contrôles masqués (touche `h`). Surtout pas en haut, c'est le bandeau
   * de statuts ; ni tout en bas, c'est le schéma bloc.
   */
  readonly captionX: number;
  readonly captionWidth: number;
  /** Distance entre le bas de l'image et le bas du bandeau, en pixels. */
  readonly captionBottom: number;
  /** Marge du bandeau autour du texte, en pixels. */
  readonly bandPadding: number;
  readonly bandOpacity: number;
  /** Fondu d'entrée et de sortie du sous-titre, en secondes. */
  readonly captionFadeS: number;
  readonly fontColor: string;
  /** Cadre de mise en évidence : couleur et épaisseur. */
  readonly highlightColor: string;
  readonly highlightThickness: number;
}

/**
 * Polices essayées dans l'ordre : Segoe UI (Windows), Arial (Windows aussi, toujours là), puis
 * DejaVu Sans (Linux). `pickFontFile` choisit la première présente ; `montage.ts` refuse de partir
 * si aucune ne l'est, plutôt que de laisser ffmpeg échouer au premier carton.
 */
export const FONT_CANDIDATES: readonly string[] = [
  'C:/Windows/Fonts/segoeui.ttf',
  'C:/Windows/Fonts/arial.ttf',
  '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf',
  '/usr/share/fonts/TTF/DejaVuSans.ttf',
  '/System/Library/Fonts/Supplemental/Arial.ttf',
];

/** Première police existante parmi les candidates ; `null` si aucune, pour un message clair. */
export function pickFontFile(candidates: readonly string[], exists: (path: string) => boolean): string | null {
  return candidates.find(exists) ?? null;
}

export const DEFAULT_STYLE: TextStyle = {
  // Remplacée au lancement du montage par la première police réellement installée.
  fontFile: 'C:/Windows/Fonts/segoeui.ttf',
  titleSize: 64,
  subtitleSize: 36,
  // 31 px : le sous-titre se lit de loin sans peser sur l'image, et deux lignes tiennent dans la
  // zone réservée. Comparé à 34 px sur une image extraite (voir README, « Style des sous-titres »).
  captionSize: 31,
  // Colonne spectateur (0–800 px), bas de la zone 3D : le bandeau de statuts descend jusqu'à y 84
  // et le schéma bloc commence à y 960 ; le bandeau s'arrête donc à y 935, soit 1080 − 145.
  // 24 px de retrait à gauche : la marge du bandeau (18 px) reste entièrement dans l'image.
  captionX: 24,
  captionWidth: 760,
  captionBottom: 145,
  bandPadding: 18,
  bandOpacity: 0.7,
  captionFadeS: 0.3,
  fontColor: 'white',
  highlightColor: '0x38BDF8@0.95',
  highlightThickness: 4,
};

/** Deux lignes au plus : au-delà, le bandeau mange la scène 3D. */
export const CAPTION_MAX_LINES = 2;

/** Fond des cartons de titre : le même bleu nuit que le dashboard. */
export const TITLE_BACKGROUND = '0x0E1116';

/** Bords de l'incrustation du terminal : un liseré plein, `pad` n'accepte pas de transparence. */
export const PIP_BORDER = '0x38BDF8';
/** Fond des bandes de l'incrustation quand le terminal n'a pas les proportions de la zone. */
export const PIP_BACKGROUND = '0x0E1116';

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
 * `text_align` : `C` centre chaque ligne d'un carton, `L` aligne le sous-titre à gauche.
 */
function drawtext(align: 'C' | 'L', parts: readonly string[]): string {
  return `drawtext=${['expansion=none', `text_align=${align}`, ...parts].join(':')}`;
}

/**
 * Cadre léger autour de la zone qu'un arrêt sur image met en évidence (schéma bloc, trace, vue).
 * Les coordonnées viennent du plan de montage : c'est lui qui sait ce qu'il montre.
 */
export function highlightFilter(rect: Rect, style: TextStyle): string {
  return `drawbox=x=${rect.x}:y=${rect.y}:w=${rect.w}:h=${rect.h}:color=${style.highlightColor}:t=${style.highlightThickness}`;
}

/** Hauteur d'une ligne de sous-titre, interligne compris. Interligne aéré : 1,45 fois le corps. */
export function captionLineHeight(style: TextStyle): number {
  return Math.round(style.captionSize * 1.45);
}

/** Hauteur du bandeau pour `lines` lignes : un sous-titre sur deux lignes doit tenir dedans. */
export function bandHeight(style: TextStyle, lines: number): number {
  return Math.max(1, lines) * captionLineHeight(style) + 2 * style.bandPadding;
}

/**
 * Sous-titre : un seul `drawtext`, avec son propre fond (`box=1`) et sa marge (`boxborderw`). Le
 * fond épouse le texte au lieu d'un bandeau pleine largeur : plus discret, et il n'occupe que la
 * zone réservée du bas de la colonne spectateur, donc il ne recouvre ni le bandeau de statuts, ni
 * le schéma bloc, ni la trace, ni les vues. Une ombre portée détache le texte des images claires,
 * et un fondu de `captionFadeS` évite l'apparition brutale à chaque coupe.
 *
 * Piège vérifié : dans `drawtext`, `ih` n'existe pas et ffmpeg 9 segfault si on l'écrit — c'est
 * `h` qui vaut la hauteur de l'image. Et l'expression d'`alpha` doit être entre apostrophes, sinon
 * ses virgules coupent la chaîne de filtres.
 */
export function captionFilters(textFile: string, style: TextStyle, lines = 1, durationS = 0): string[] {
  const height = bandHeight(style, lines);
  const fade = style.captionFadeS;
  const alpha =
    durationS > 2 * fade
      ? [`alpha='if(lt(t,${fade}),t/${fade},if(gt(t,${(durationS - fade).toFixed(2)}),max(0,(${durationS.toFixed(2)}-t)/${fade}),1))'`]
      : [];
  return [
    drawtext('L', [
      `fontfile=${escapeFilterPath(style.fontFile)}`,
      `textfile=${escapeFilterPath(textFile)}`,
      `fontsize=${style.captionSize}`,
      `fontcolor=${style.fontColor}`,
      'box=1',
      `boxcolor=black@${style.bandOpacity}`,
      `boxborderw=${style.bandPadding}`,
      'shadowcolor=black@0.85',
      'shadowx=2',
      'shadowy=2',
      `x=${style.captionX}`,
      `y=h-${style.captionBottom + height - style.bandPadding}`,
      `line_spacing=${captionLineHeight(style) - style.captionSize}`,
      ...alpha,
    ]),
  ];
}

/**
 * Incrustation d'une seconde source (la capture du terminal) dans la première, avec un liseré de la
 * couleur des cadres de mise en évidence. Le graphe complet est rendu ici : `[0:v]` est la prise,
 * `[1:v]` le terminal, `overlays` les filtres de sous-titre et de cadre à appliquer ensuite.
 */
export function pipComplex(format: Format, rect: Rect, style: TextStyle, overlays: readonly string[]): string {
  const border = style.highlightThickness;
  const innerW = rect.w - 2 * border;
  const innerH = rect.h - 2 * border;
  return [
    `[0:v]${chain(normalizeFilters(format))}[bg]`,
    `[1:v]scale=${innerW}:${innerH}:force_original_aspect_ratio=decrease,` +
      `pad=${innerW}:${innerH}:(ow-iw)/2:(oh-ih)/2:color=${PIP_BACKGROUND},setsar=1,` +
      `pad=${rect.w}:${rect.h}:${border}:${border}:color=${PIP_BORDER}[pip]`,
    `[bg][pip]overlay=${rect.x}:${rect.y}[framed]`,
    `[framed]${chain([...overlays])}[out]`,
  ].join(';');
}

/** Carton de titre : titre centré, sous-titre optionnel juste dessous. */
export function titleFilters(titleFile: string, subtitleFile: string | null, style: TextStyle): string[] {
  const common = [`fontfile=${escapeFilterPath(style.fontFile)}`, `fontcolor=${style.fontColor}`, 'x=(w-text_w)/2', 'line_spacing=14'];
  if (subtitleFile === null) {
    return [drawtext('C', [...common, `textfile=${escapeFilterPath(titleFile)}`, `fontsize=${style.titleSize}`, 'y=(h-text_h)/2'])];
  }
  return [
    drawtext('C', [...common, `textfile=${escapeFilterPath(titleFile)}`, `fontsize=${style.titleSize}`, 'y=(h-text_h)/2-50']),
    drawtext('C', [
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
