import { describe, expect, it } from 'vitest';
import { vdot, vlen, vsub } from '@tomato/shared';
import type { Vec3 } from '@tomato/shared';
import { REST_CUT_POINT_CM } from './restPose';
import { poseFromAngles, scissorsPoints } from './scissorsGeometry';
import {
  insetRect, INSET_MARGIN_PX, INSET_WIDTH_RATIO, scissorsAtRest, smoothTowards, toolCamAutoVisible,
  toolCameraPose, TOOL_CAM_LINGER_S, TOOL_CAM_MIN_Z_CM, TOOL_CAM_SMOOTH_S,
} from './toolCamera';

/** Pose de coupe réelle de l'épisode 2026-09-18T20-16-54-341Z-t1. */
const CUT = scissorsPoints(poseFromAngles([12.32, -5.34, 61.45], 58.43, -13.59, 0, 60));
const REST = scissorsPoints(poseFromAngles(REST_CUT_POINT_CM, 0, 0, 0, 0));

describe('toolCameraPose', () => {
  it('vise le point de coupe, en retrait et sous le plan des lames', () => {
    for (const points of [CUT, REST]) {
      const { eyeCm, targetCm, upCm } = toolCameraPose(points);
      expect(targetCm).toEqual(points.cutPointCm);
      const toEye = vsub(eyeCm, points.pivotCm);
      // En retrait : la composante sur l'axe des lames est négative (les lames pointent devant).
      expect(vdot(toEye, points.bladeAxis)).toBeLessThan(0);
      // Sous le plan des lames : au-dessus, c'est la feuille sous laquelle pend le fruit qu'on filme.
      expect(vdot(toEye, points.bladeNormal)).toBeLessThan(-10);
      // Du côté opposé au bras : la transverse positive est, à la coupe, la direction du coude.
      expect(vdot(toEye, points.transverse)).toBeLessThan(0);
      expect(vlen(upCm)).toBeCloseTo(1, 6);
    }
  });

  it('ne passe jamais sous le sol, même ciseaux au ras du panier', () => {
    const low = scissorsPoints(poseFromAngles([10, -5, 14], 0, 0, 0, 0));
    expect(toolCameraPose(low).eyeCm[2]).toBeGreaterThanOrEqual(TOOL_CAM_MIN_Z_CM);
  });

  it('se tient à environ 35 cm du point de coupe, de quoi cadrer les lames de près', () => {
    for (const points of [CUT, REST]) {
      const distanceCm = vlen(vsub(toolCameraPose(points).eyeCm, points.cutPointCm));
      expect(distanceCm).toBeGreaterThan(30);
      expect(distanceCm).toBeLessThan(40);
    }
  });

  it('garde un « haut » qui n’est pas dans l’axe du regard, sinon la vue part en vrille', () => {
    // Lames dressées à la verticale : le haut du monde ne peut plus servir de référence.
    const upright = scissorsPoints(poseFromAngles([10, -5, 60], 0, 89.5, 0, 30));
    const { eyeCm, targetCm, upCm } = toolCameraPose(upright);
    const sight = vsub(targetCm, eyeCm);
    const cos = Math.abs(vdot(sight, upCm)) / (vlen(sight) * vlen(upCm));
    expect(cos).toBeLessThan(0.95);
  });
});

describe('smoothTowards', () => {
  const from: Vec3 = [0, 0, 0];
  const to: Vec3 = [10, -20, 5];

  it('ne bouge pas sans temps écoulé et atteint la cible au bout d’un long pas', () => {
    expect(smoothTowards(from, to, 0, TOOL_CAM_SMOOTH_S)).toEqual(from);
    const far = smoothTowards(from, to, 10, TOOL_CAM_SMOOTH_S);
    expect(far[0]).toBeCloseTo(to[0], 6);
    expect(far[1]).toBeCloseTo(to[1], 6);
  });

  it('parcourt 63 % du chemin en une constante de temps', () => {
    const step = smoothTowards(from, to, TOOL_CAM_SMOOTH_S, TOOL_CAM_SMOOTH_S);
    expect(step[0] / to[0]).toBeCloseTo(1 - Math.exp(-1), 6);
  });

  it('saute à la cible si la constante de temps est nulle', () => {
    expect(smoothTowards(from, to, 0.016, 0)).toEqual(to);
  });
});

describe('scissorsAtRest', () => {
  it('reconnaît la pose de repos et voit le moindre mouvement ou la moindre rotation', () => {
    expect(scissorsAtRest(poseFromAngles(REST_CUT_POINT_CM, 0, 0, 0, 0))).toBe(true);
    expect(scissorsAtRest(poseFromAngles([REST_CUT_POINT_CM[0] - 2, -8, 62], 0, 0, 0, 0))).toBe(false);
    expect(scissorsAtRest(poseFromAngles(REST_CUT_POINT_CM, 20, 0, 0, 0))).toBe(false);
    expect(scissorsAtRest(poseFromAngles(REST_CUT_POINT_CM, 0, 0, 0, 60))).toBe(false);
  });
});

describe('toolCamAutoVisible', () => {
  it('s’allume dès que les ciseaux quittent le repos', () => {
    expect(toolCamAutoVisible({ atRest: true, sinceLandedS: null })).toBe(false);
    expect(toolCamAutoVisible({ atRest: false, sinceLandedS: null })).toBe(true);
  });

  it('reste allumée deux secondes après l’atterrissage, même bras rangé', () => {
    expect(toolCamAutoVisible({ atRest: true, sinceLandedS: 0 })).toBe(true);
    expect(toolCamAutoVisible({ atRest: true, sinceLandedS: TOOL_CAM_LINGER_S - 0.1 })).toBe(true);
    expect(toolCamAutoVisible({ atRest: true, sinceLandedS: TOOL_CAM_LINGER_S })).toBe(false);
  });
});

describe('insetRect', () => {
  it('pose l’incrustation en bas à droite, 30 % de large, en 4:3', () => {
    const rect = insetRect(800);
    expect(rect.widthPx).toBe(Math.round(800 * INSET_WIDTH_RATIO));
    expect(rect.heightPx).toBe(Math.round((800 * INSET_WIDTH_RATIO * 3) / 4));
    expect(rect.xPx).toBe(800 - rect.widthPx - INSET_MARGIN_PX);
    // Origine WebGL en bas à gauche : y est la marge basse.
    expect(rect.yPx).toBe(INSET_MARGIN_PX);
  });
});
