import type { BasketPose, CameraId, CameraPose, ScissorsPose, TomatoView, Vec2, Vec3, ViewsPayload } from '@tomato/shared';
import { projectToPixel } from './ortho';
import { leader, line, text, type OverlayCommand } from './overlayTypes';
import { PALETTE } from './palette';
import { scissorsPoints } from './scissorsGeometry';

const CUT_CROSS_PX = 10;
/** Rayon des marques de pointe de lame (spec : cercles de 3 px). */
export const BLADE_TIP_RADIUS_PX = 3;
/** En dessous de cet angle les deux lames se confondent : on marque les pointes pour les situer. */
const CLOSED_OPENING_DEG = 5;
const BASKET_CROSS_PX = 8;
const LABEL_GAP_PX = 6;
const FALL_DASH: Vec2 = [6, 6];

const fmt = (v: number): string => v.toFixed(1);

/** Tige cible : polyligne cyan du pédoncule (branche → fruit), point d'attache marqué. */
export function stemCommands(camId: CameraId, pose: CameraPose, target: TomatoView | undefined): OverlayCommand[] {
  if (!target) return [];
  const a = projectToPixel(camId, pose, target.stem.fromCm);
  const b = projectToPixel(camId, pose, target.stem.toCm);
  return [
    line(a, b, PALETTE.stem, 3),
    { kind: 'circle', center: a, radiusPx: 4, color: PALETTE.stem, width: 1, fill: PALETTE.stem },
    leader(b, [b[0] + LABEL_GAP_PX - 2, b[1] + 11], PALETTE.stem, 'tige-cible'),
    text([b[0] + LABEL_GAP_PX, b[1] + 16], 'tige cible', PALETTE.stem, undefined, undefined, 'tige-cible'),
  ];
}

/**
 * Ancre de l'étiquette « normale » : au-dessus du bout de la normale quand celle-ci monte dans
 * l'image, en dessous sinon — en vue top la normale pointe vers la caméra, son glyphe se réduit à
 * un point et l'étiquette viendrait sinon coller celle de l'axe lame.
 */
function normalLabelAt(cut: Vec2, normalEnd: Vec2): Vec2 {
  const goesUp = normalEnd[1] - cut[1] < -LABEL_GAP_PX;
  return [normalEnd[0] + LABEL_GAP_PX, normalEnd[1] + (goesUp ? -2 * LABEL_GAP_PX : 3 * LABEL_GAP_PX)];
}

/** Ciseaux : pivot, deux lames, croix du point de coupe, axe lame (magenta) et normale (blanc-bleu), angles en texte. */
export function scissorsCommands(camId: CameraId, pose: CameraPose, s: ScissorsPose): OverlayCommand[] {
  const p = scissorsPoints(s);
  const px = (v: Vec3): Vec2 => projectToPixel(camId, pose, v);
  const pivot = px(p.pivot);
  const cut = px(p.cutPoint);
  const axisEnd = px(p.axisEnd);
  const normalEnd = px(p.normalEnd);
  const angles = `ciseaux lacet ${s.yawDeg.toFixed(0)}° tangage ${s.pitchDeg.toFixed(0)}° roulis ${s.rollDeg.toFixed(0)}° ouverture ${s.openingDeg.toFixed(0)}°`;
  const tipA = px(p.tipA);
  const tipB = px(p.tipB);
  const closed = Math.abs(s.openingDeg) < CLOSED_OPENING_DEG;
  const tipMarks: OverlayCommand[] = closed
    ? [tipA, tipB].map((c) => ({ kind: 'circle', center: c, radiusPx: BLADE_TIP_RADIUS_PX, color: PALETTE.bladeAxis, width: 1.5 }))
    : [];
  return [
    line(pivot, tipA, PALETTE.bladeAxis, 2.5),
    line(pivot, tipB, PALETTE.bladeAxis, 2.5),
    ...tipMarks,
    { kind: 'circle', center: pivot, radiusPx: 5, color: PALETTE.bladeAxis, width: 1, fill: PALETTE.bladeAxis },
    { kind: 'cross', center: cut, sizePx: CUT_CROSS_PX, color: PALETTE.bladeAxis, width: 2 },
    line(cut, axisEnd, PALETTE.bladeAxis, 2),
    leader(axisEnd, [axisEnd[0] + LABEL_GAP_PX - 2, axisEnd[1]], PALETTE.bladeAxis, 'lame'),
    text([axisEnd[0] + LABEL_GAP_PX, axisEnd[1] + 4], 'lame', PALETTE.bladeAxis, undefined, undefined, 'lame'),
    line(cut, normalEnd, PALETTE.bladeNormal, 2),
    leader(normalEnd, normalLabelAt(cut, normalEnd), PALETTE.bladeNormal, 'normale'),
    text(normalLabelAt(cut, normalEnd), 'normale', PALETTE.bladeNormal, undefined, undefined, 'normale'),
    leader(pivot, [pivot[0] + 8, pivot[1] - 16], PALETTE.bladeAxis, 'ciseaux'),
    text([pivot[0] + 10, pivot[1] - 12], angles, PALETTE.bladeAxis, undefined, undefined, 'ciseaux'),
  ];
}

/** Panier : rectangle du fond et du bord projetés, arêtes verticales, centre en croix, position en texte. */
export function basketCommands(camId: CameraId, pose: CameraPose, b: BasketPose): OverlayCommand[] {
  const [cx, cy, z0] = b.centerCm;
  const hx = b.sizeCm[0] / 2;
  const hy = b.sizeCm[1] / 2;
  const ring = (z: number): Vec2[] => {
    const corners: Vec3[] = [[cx - hx, cy - hy, z], [cx + hx, cy - hy, z], [cx + hx, cy + hy, z], [cx - hx, cy + hy, z]];
    return corners.map((v) => projectToPixel(camId, pose, v));
  };
  const floor = ring(z0);
  const rim = ring(z0 + b.depthCm);
  const out: OverlayCommand[] = [
    { kind: 'polygon', points: floor, color: PALETTE.basket, width: 2.5 },
    { kind: 'polygon', points: rim, color: PALETTE.basket, width: 1 },
  ];
  for (let i = 0; i < 4; i++) out.push(line(floor[i]!, rim[i]!, PALETTE.basket, 1));
  const c = projectToPixel(camId, pose, b.centerCm);
  out.push(
    { kind: 'cross', center: c, sizePx: BASKET_CROSS_PX, color: PALETTE.basket, width: 2 },
    leader(c, [c[0] + 6, c[1] - 12], PALETTE.basket, 'panier'),
    text([c[0] + 8, c[1] - 8], `panier (${cx.toFixed(0)}, ${cy.toFixed(0)}) z=${z0.toFixed(0)}`, PALETTE.basket, undefined, undefined, 'panier'),
  );
  return out;
}

/** Verticale de chute : pointillé de la tomate cible vers le plan du fond du panier (même X, Y), impact marqué. */
export function fallLineCommands(camId: CameraId, pose: CameraPose, target: TomatoView | undefined, basket: BasketPose): OverlayCommand[] {
  if (!target) return [];
  const [x, y] = target.positionCm;
  const impact: Vec3 = [x, y, basket.centerCm[2]];
  const a = projectToPixel(camId, pose, target.positionCm);
  const b = projectToPixel(camId, pose, impact);
  return [
    { kind: 'dashedLine', from: a, to: b, color: PALETTE.fall, width: 1.5, dash: FALL_DASH },
    { kind: 'circle', center: b, radiusPx: 6, color: PALETTE.basket, width: 2 },
    leader([b[0] + 6, b[1]], [b[0] + 6, b[1] + 1], PALETTE.fall, 'impact'),
    text([b[0] + 8, b[1] + 5], `impact (${fmt(x)}, ${fmt(y)})`, PALETTE.fall, undefined, undefined, 'impact'),
  ];
}

/** Couche 4 : tige cible, panier, verticale de chute, ciseaux. */
export function toolCommands(camId: CameraId, pose: CameraPose, payload: ViewsPayload): OverlayCommand[] {
  const target = payload.tomatoes.find((t) => t.id === payload.targetTomatoId);
  return [
    ...stemCommands(camId, pose, target),
    ...basketCommands(camId, pose, payload.basket),
    ...fallLineCommands(camId, pose, target, payload.basket),
    ...scissorsCommands(camId, pose, payload.scissors),
  ];
}
