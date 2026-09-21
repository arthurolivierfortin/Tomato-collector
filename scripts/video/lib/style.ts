/**
 * Le vocabulaire visuel du montage : rectangles, format de sortie, et le style des textes gravés.
 * Aucune dépendance à ffmpeg, rien que des valeurs et deux calculs de hauteur. `ffmpegFilters.ts`
 * les réexporte, pour que le reste du pipeline n'ait qu'un seul point d'entrée.
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

/** Hauteur d'une ligne de sous-titre, interligne compris. Interligne aéré : 1,45 fois le corps. */
export function captionLineHeight(style: TextStyle): number {
  return Math.round(style.captionSize * 1.45);
}

/** Hauteur du bandeau pour `lines` lignes : un sous-titre sur deux lignes doit tenir dedans. */
export function bandHeight(style: TextStyle, lines: number): number {
  return Math.max(1, lines) * captionLineHeight(style) + 2 * style.bandPadding;
}

/**
 * Nombre de caractères tenant dans un bandeau de `width` pixels, au corps du style. `drawtext` ne
 * renvoie pas à la ligne tout seul : c'est ce nombre qui décide de la coupe, donc du nombre de
 * lignes, donc de la hauteur du bandeau. Il vit ici, avec le reste du vocabulaire visuel, pour que
 * le plan puisse vérifier sans ffmpeg qu'un sous-titre tient dans la largeur qu'on lui laisse.
 */
export function captionWrapChars(style: TextStyle, width: number): number {
  return Math.max(12, Math.floor((width - 4 * style.bandPadding) / (style.captionSize * 0.44)));
}

/**
 * Le bandeau pleine largeur : de bord à bord, du haut de la boîte de texte jusqu'au bas de l'image.
 *
 * Sur le dashboard, le fond du sous-titre épouse le texte et c'est très bien : le bas de la colonne
 * spectateur est vide. Sur un écran plein format, tout ce qui reste à droite du texte se lit encore
 * à moitié ; la bande descend donc jusqu'en bas pour qu'aucun fragment ne dépasse ni à droite ni
 * dessous.
 */
export function captionBandRect(style: TextStyle, lines: number, format: Format): Rect {
  const y = format.height - style.captionBottom - bandHeight(style, lines);
  return { x: 0, y, w: format.width, h: format.height - y };
}
