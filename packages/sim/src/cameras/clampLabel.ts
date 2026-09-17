import type { Vec2 } from '@tomato/shared';
import type { OverlayCommand, TextAlign } from './overlayTypes';

/** Marge minimale entre le texte et le bord de l'image (px). */
export const LABEL_MARGIN_PX = 4;
/** Largeur d'un caractère du monospace gras, mesurée à 7,5 px pour une police de 13 px. */
export const CHAR_WIDTH_RATIO = 7.5 / 13;
/** Débord du halo (HALO_WIDTH_PX / 2 dans drawOverlay) de chaque côté du glyphe. */
const HALO_PAD_PX = 2;
/** Hauteur de capitale et profondeur de jambage, en fraction de la taille de police. */
const ASCENT_RATIO = 0.8;
const DESCENT_RATIO = 0.25;

/** Largeur estimée d'une étiquette, halo compris (le contexte 2D n'est pas disponible côté pur). */
export function labelWidthPx(value: string, fontPx: number): number {
  return value.length * fontPx * CHAR_WIDTH_RATIO + 2 * HALO_PAD_PX;
}

const clampTo = (v: number, min: number, max: number): number => (max < min ? min : Math.min(Math.max(v, min), max));

/**
 * Ramène l'ancre d'une étiquette alignée à gauche pour que tout son texte (halo compris) reste
 * dans une image carrée de `size` px : à gauche du point s'il déborde à droite, au-dessus s'il
 * déborde en bas. Fonction pure.
 */
export function clampLabel(x: number, y: number, value: string, fontPx: number, size: number): Vec2 {
  const w = labelWidthPx(value, fontPx);
  const cx = clampTo(x, LABEL_MARGIN_PX, size - LABEL_MARGIN_PX - w);
  const top = LABEL_MARGIN_PX + fontPx * ASCENT_RATIO + HALO_PAD_PX;
  const bottom = size - LABEL_MARGIN_PX - fontPx * DESCENT_RATIO - HALO_PAD_PX;
  return [cx, clampTo(y, top, bottom)];
}

/** Décalage entre l'ancre et le bord gauche du texte selon l'alignement du canvas 2D. */
const leftOffset = (align: TextAlign, w: number): number => (align === 'center' ? w / 2 : align === 'right' ? w : 0);

/** Passe finale : chaque commande `text` est ramenée dans le cadre, son alignement conservé. */
export function clampCommands(commands: readonly OverlayCommand[], size: number): OverlayCommand[] {
  return commands.map((c) => {
    if (c.kind !== 'text') return c;
    const offset = leftOffset(c.align, labelWidthPx(c.text, c.sizePx));
    const [x, y] = clampLabel(c.at[0] - offset, c.at[1], c.text, c.sizePx, size);
    return { ...c, at: [x + offset, y] satisfies Vec2 };
  });
}
