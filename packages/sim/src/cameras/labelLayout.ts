import { ASCENT_RATIO, DESCENT_RATIO, HALO_PAD_PX, labelWidthPx, leftOffset } from './clampLabel';
import type { OverlayCommand } from './overlayTypes';

/** Boîte d'une étiquette en pixels image : coin haut gauche, largeur et hauteur (halo compris). */
export interface LabelBox {
  leftPx: number;
  topPx: number;
  widthPx: number;
  heightPx: number;
}

/** Interligne laissé entre deux étiquettes empilées. */
export const LABEL_STACK_GAP_PX = 3;
/** Blanc horizontal exigé entre deux étiquettes voisines : côte à côte et collées, elles se lisent mal. */
export const LABEL_SIDE_GAP_PX = 6;
/** Marge conservée entre une étiquette et le bord de l'image. */
export const STACK_MARGIN_PX = 4;
/** Garde-fou : une boîte ne redescend pas indéfiniment si les autres l'entourent. */
const MAX_PUSHES = 64;

const overlaps = (a: LabelBox, bLeft: number, bRight: number, bTop: number, bBottom: number): boolean =>
  a.leftPx - LABEL_SIDE_GAP_PX < bRight &&
  a.leftPx + a.widthPx + LABEL_SIDE_GAP_PX > bLeft &&
  a.topPx < bBottom &&
  a.topPx + a.heightPx > bTop;

/**
 * Empile verticalement les étiquettes qui se recouvrent : traitées de la plus haute à la plus basse,
 * chacune descend juste sous la dernière boîte déjà posée qu'elle chevauche, puis est ramenée dans
 * le cadre. Deux étiquettes dont les plages horizontales ne se croisent pas ne se gênent pas.
 * Fonction pure : renvoie le nouveau `topPx` de chaque boîte, dans l'ordre d'entrée.
 */
export function stackLabels(boxes: readonly LabelBox[], sizePx: number): number[] {
  const order = boxes.map((b, i) => ({ b, i })).sort((p, q) => p.b.topPx - q.b.topPx || p.i - q.i);
  const placed: LabelBox[] = [];
  const tops = new Array<number>(boxes.length).fill(0);
  for (const { b, i } of order) {
    let top = b.topPx;
    for (let n = 0; n < MAX_PUSHES; n++) {
      const hit = placed.find((p) => overlaps(p, b.leftPx, b.leftPx + b.widthPx, top, top + b.heightPx));
      if (hit === undefined) break;
      top = hit.topPx + hit.heightPx + LABEL_STACK_GAP_PX;
    }
    const maxTop = sizePx - STACK_MARGIN_PX - b.heightPx;
    top = Math.min(Math.max(top, STACK_MARGIN_PX), Math.max(STACK_MARGIN_PX, maxTop));
    tops[i] = top;
    placed.push({ ...b, topPx: top });
  }
  return tops;
}

/** Boîte d'un texte : largeur estimée (halo compris), hauteur cap + jambage autour de la ligne de base. */
function textBox(c: Extract<OverlayCommand, { kind: 'text' }>): LabelBox {
  const widthPx = labelWidthPx(c.text, c.sizePx);
  return {
    leftPx: c.at[0] - leftOffset(c.align, widthPx),
    topPx: c.at[1] - c.sizePx * ASCENT_RATIO - HALO_PAD_PX,
    widthPx,
    heightPx: c.sizePx * (ASCENT_RATIO + DESCENT_RATIO) + 2 * HALO_PAD_PX,
  };
}

const union = (a: LabelBox, b: LabelBox): LabelBox => {
  const leftPx = Math.min(a.leftPx, b.leftPx);
  const topPx = Math.min(a.topPx, b.topPx);
  return {
    leftPx,
    topPx,
    widthPx: Math.max(a.leftPx + a.widthPx, b.leftPx + b.widthPx) - leftPx,
    heightPx: Math.max(a.topPx + a.heightPx, b.topPx + b.heightPx) - topPx,
  };
};

/** Boîte d'une commande qui occupe de la place dans un groupe d'étiquettes (texte ou cadre de badge). */
function boxOf(c: OverlayCommand): LabelBox | null {
  if (c.kind === 'text') return textBox(c);
  if (c.kind === 'rect') {
    return { leftPx: Math.min(c.from[0], c.to[0]), topPx: Math.min(c.from[1], c.to[1]), widthPx: Math.abs(c.to[0] - c.from[0]), heightPx: Math.abs(c.to[1] - c.from[1]) };
  }
  return null;
}

/** Décale une commande ; une amorce ne suit que par son extrémité, son ancre reste sur l'objet. */
function shift(c: OverlayCommand, dx: number, dy: number): OverlayCommand {
  switch (c.kind) {
    case 'text':
      return { ...c, at: [c.at[0] + dx, c.at[1] + dy] };
    case 'rect':
      return { ...c, from: [c.from[0] + dx, c.from[1] + dy], to: [c.to[0] + dx, c.to[1] + dy] };
    case 'line':
      return { ...c, to: [c.to[0] + dx, c.to[1] + dy] };
    default:
      return c;
  }
}

const clampTo = (v: number, min: number, max: number): number => (max < min ? min : Math.min(Math.max(v, min), max));

/**
 * Passe anti-recouvrement des étiquettes flottantes (couches 3 et 4) : les commandes portant le même
 * `group` forment un bloc, les blocs qui se recouvrent sont empilés vers le bas et chaque bloc est
 * déplacé d'un seul tenant. Les commandes sans `group` — grille, marges, bandeau — ne bougent pas.
 */
export function spreadLabelGroups(commands: readonly OverlayCommand[], sizePx: number): OverlayCommand[] {
  const boxes = new Map<string, LabelBox>();
  for (const c of commands) {
    if (c.group === undefined) continue;
    const b = boxOf(c);
    if (b === null) continue;
    const seen = boxes.get(c.group);
    boxes.set(c.group, seen === undefined ? b : union(seen, b));
  }
  if (boxes.size === 0) return [...commands];
  const keys = [...boxes.keys()];
  // Rentrer les blocs dans le cadre AVANT de les empiler : sinon un bloc trop large ramené par le
  // bord droit retombe sur un voisin que la passe verticale croyait à l'écart.
  const inFrame = keys.map((k) => {
    const b = boxes.get(k)!;
    return { ...b, leftPx: clampTo(b.leftPx, STACK_MARGIN_PX, sizePx - STACK_MARGIN_PX - b.widthPx) };
  });
  const tops = stackLabels(inFrame, sizePx);
  const shifts = new Map(keys.map((k, i) => [k, { dx: inFrame[i]!.leftPx - boxes.get(k)!.leftPx, dy: tops[i]! - boxes.get(k)!.topPx }]));
  return commands.map((c) => {
    const d = c.group === undefined ? undefined : shifts.get(c.group);
    return d === undefined || (d.dx === 0 && d.dy === 0) ? c : shift(c, d.dx, d.dy);
  });
}
