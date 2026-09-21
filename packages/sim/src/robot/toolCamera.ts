import { vadd, vdot, vlen, vnorm, vscale, vsub } from '@tomato/shared';
import type { ScissorsPose, Vec3 } from '@tomato/shared';
import { REST_CUT_POINT_CM } from './restPose';
import type { ScissorsPoints } from './scissorsGeometry';

/**
 * Caméra embarquée « outil » (issue #42).
 *
 * Un plan large ne montrera jamais un geste de 6 cm : à 1,7 m, les lames font une quarantaine de
 * pixels, vues de tranche, souvent derrière une feuille. Cette caméra-ci est montée sur les ciseaux,
 * à 35 cm derrière le pivot et légèrement au-dessus, et regarde le point de coupe. Elle est rendue
 * en incrustation dans la vue spectateur, après le rendu principal : rien de ce qui suit ne touche
 * aux caméras de l'agent ni à la passe d'identifiants.
 *
 * Tout ce fichier est pur — position, lissage, règle d'affichage, géométrie de l'incrustation ;
 * `toolCameraView.ts` s'occupe du rendu.
 */

export const TOOL_CAM_FOV_DEG = 40;

/** Où se met la caméra par rapport au pivot, dans le repère des lames. */
export interface ToolCamPlacement {
  /** Recul le long de l'axe des lames (elles pointent vers l'avant). */
  readonly backCm: number;
  /** Décalage latéral sur la transverse des lames. */
  readonly sideCm: number;
  /** Hauteur sur la normale des lames, celle autour de laquelle elles s'ouvrent. */
  readonly normalCm: number;
  /** Hauteur sur le Z du monde, pour garder un peu de plongée quelle que soit la pose. */
  readonly upCm: number;
}

/**
 * Placement retenu, choisi en regardant neuf variantes sur la pose de coupe réelle de l'épisode
 * 2026-09-18T20-16-54-341Z-t1 (planche `sheet-toolcam.png`).
 *
 * Trois choses se sont vues à l'image et ne se devinaient pas :
 *
 * 1. **Pile derrière les lames, on ne voit pas les lames.** Elles pointent alors vers le fond, et le
 *    pivot puis les deux anneaux de poignée, qui sont justement derrière, les recouvrent.
 * 2. **Au-dessus non plus.** Le fruit mûr pend sous une feuille — c'est ce qui gênait déjà le plan
 *    large — et une caméra qui plonge n'attrape que cette feuille.
 * 3. **La transverse positive, c'est le côté du bras.** À la coupe, la direction du pivot vers le
 *    coude est à 15° de la transverse : décaler « de côté » vers le + met la caméra derrière
 *    l'avant-bras, qui remplit alors le cadre.
 *
 * D'où : un peu en retrait (17), très légèrement du côté opposé au bras (−5), et surtout **sous** le
 * plan des lames (−26). Les ciseaux s'y détachent sur le fond sombre, l'ouverture se lit comme un V,
 * le pédoncule passe entre les deux lames et la tomate cible remplit le bas du cadre.
 */
export const TOOL_CAM_PLACEMENT: ToolCamPlacement = { backCm: 17, sideCm: -5, normalCm: -26, upCm: 0 };
/** Constante de temps du lissage, en secondes réelles : la caméra suit sans à-coups. */
export const TOOL_CAM_SMOOTH_S = 0.2;
/** Temps pendant lequel l'incrustation reste après l'atterrissage du fruit. */
export const TOOL_CAM_LINGER_S = 2;
/** Tolérances de « les ciseaux sont à la pose de repos ». */
const REST_TOLERANCE_CM = 0.5;
const REST_TOLERANCE_DEG = 0.5;

export const INSET_WIDTH_RATIO = 0.3;
export const INSET_ASPECT = 4 / 3;
export const INSET_MARGIN_PX = 12;

/**
 * Plancher de la caméra : sous le plan des lames, une pose basse la ferait passer sous le sol, d'où
 * l'on ne voit qu'un plan gris. L'agent peut descendre les ciseaux jusqu'au panier.
 */
export const TOOL_CAM_MIN_Z_CM = 12;

const WORLD_UP: Vec3 = [0, 0, 1];
/** Au-delà de ce cosinus, le haut du monde est trop près de la ligne de visée pour servir de haut. */
const UP_PARALLEL_COS = 0.9;

export interface ToolCameraPose {
  readonly eyeCm: Vec3;
  readonly targetCm: Vec3;
  readonly upCm: Vec3;
}

/** Où se tient la caméra outil pour une pose de ciseaux, et ce qu'elle regarde. */
export function toolCameraPose(points: ScissorsPoints, placement: ToolCamPlacement = TOOL_CAM_PLACEMENT): ToolCameraPose {
  const offset = vadd(
    vadd(vscale(points.bladeAxis, -placement.backCm), vscale(points.transverse, placement.sideCm)),
    vadd(vscale(points.bladeNormal, placement.normalCm), vscale(WORLD_UP, placement.upCm)),
  );
  const raw = vadd(points.pivotCm, offset);
  const eyeCm: Vec3 = [raw[0], raw[1], Math.max(raw[2], TOOL_CAM_MIN_Z_CM)];
  const sight = vnorm(vsub(points.cutPointCm, eyeCm));
  // Lames dressées : la visée devient verticale et le haut du monde ne dit plus rien. La normale
  // des lames, elle, est toujours perpendiculaire à leur axe, donc jamais dans la visée.
  const upCm = Math.abs(vdot(sight, WORLD_UP)) > UP_PARALLEL_COS ? vnorm(points.bladeNormal) : WORLD_UP;
  return { eyeCm, targetCm: points.cutPointCm, upCm };
}

/** Lissage exponentiel : `tauS` est le temps pour couvrir 63 % de l'écart restant. */
export function smoothTowards(current: Vec3, goal: Vec3, dtS: number, tauS: number): Vec3 {
  if (tauS <= 0) return goal;
  const k = 1 - Math.exp(-Math.max(0, dtS) / tauS);
  return vadd(current, vscale(vsub(goal, current), k));
}

/** Les ciseaux sont-ils garés, position et angles compris (issue #31, `restPose.ts`) ? */
export function scissorsAtRest(scissors: ScissorsPose): boolean {
  return (
    vlen(vsub(scissors.cutPointCm, REST_CUT_POINT_CM)) <= REST_TOLERANCE_CM &&
    Math.abs(scissors.yawDeg) <= REST_TOLERANCE_DEG &&
    Math.abs(scissors.pitchDeg) <= REST_TOLERANCE_DEG &&
    Math.abs(scissors.rollDeg) <= REST_TOLERANCE_DEG &&
    Math.abs(scissors.openingDeg) <= REST_TOLERANCE_DEG
  );
}

export interface ToolCamAutoInput {
  /** Les ciseaux sont à la pose de repos : rien à montrer de près. */
  readonly atRest: boolean;
  /** Secondes réelles depuis le dernier `tomato_landed`, `null` si aucun depuis le chargement. */
  readonly sinceLandedS: number | null;
}

/**
 * Règle d'affichage automatique : allumée du premier mouvement de ciseaux de l'épisode — c'est
 * exactement « les ciseaux ne sont plus au repos » — jusqu'à deux secondes après l'atterrissage,
 * pour laisser voir la chute même si le bras est déjà rentré.
 */
export function toolCamAutoVisible(input: ToolCamAutoInput): boolean {
  if (input.sinceLandedS !== null && input.sinceLandedS < TOOL_CAM_LINGER_S) return true;
  return !input.atRest;
}

export interface InsetRect {
  /** Coin bas gauche, en pixels CSS, origine en bas à gauche comme `setViewport`. */
  readonly xPx: number;
  readonly yPx: number;
  readonly widthPx: number;
  readonly heightPx: number;
}

/**
 * Place l'incrustation dans le coin bas droit du canvas spectateur. La hauteur du canvas n'entre pas
 * dans le calcul : l'origine de `setViewport` est en bas à gauche, donc le bord bas est la marge.
 */
export function insetRect(canvasWidthPx: number): InsetRect {
  const widthPx = Math.round(canvasWidthPx * INSET_WIDTH_RATIO);
  const heightPx = Math.round(widthPx / INSET_ASPECT);
  return { xPx: canvasWidthPx - widthPx - INSET_MARGIN_PX, yPx: INSET_MARGIN_PX, widthPx, heightPx };
}
