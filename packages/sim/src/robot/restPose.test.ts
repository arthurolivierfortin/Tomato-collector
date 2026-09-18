import { CAMERA_IDS, VIEW_SIZE_PX, createDefaultWorld, type CameraId, type Vec3 } from '@tomato/shared';
import { describe, expect, it } from 'vitest';
import { projectToPixel } from '../cameras/ortho';
import { scissorsPoints } from '../cameras/scissorsGeometry';
import { solveIk } from './ik';
import { isReachable } from './reach';
import { REST_CUT_POINT_CM, atRest } from './restPose';

/** Marge exigée entre le schéma des ciseaux et le bord de l'image, en pixels (bandeau haut compris). */
const MARGIN_PX = 48;

const world = atRest(createDefaultWorld(1));

/** Les points dessinés du schéma des ciseaux (pivot, pointes, croix, bouts des axes). */
function glyphPoints(): Vec3[] {
  const p = scissorsPoints(world.scissors);
  return [p.pivot, p.tipA, p.tipB, p.cutPoint, p.axisEnd, p.normalEnd];
}

describe('pose de repos des ciseaux', () => {
  it('starts the sim at the rest cut point, blades closed and unrotated', () => {
    expect(world.scissors.cutPointCm).toEqual(REST_CUT_POINT_CM);
    expect(world.scissors.openingDeg).toBe(0);
    expect([world.scissors.yawDeg, world.scissors.pitchDeg, world.scissors.rollDeg]).toEqual([0, 0, 0]);
  });

  it('keeps the arm within reach of its base', () => {
    const { scissorsBaseCm, scissorsReachCm } = world.limits;
    expect(isReachable(scissorsBaseCm, scissorsReachCm, REST_CUT_POINT_CM)).toBe(true);
    expect(solveIk(scissorsBaseCm, scissorsPoints(world.scissors).pivot)).not.toBeNull();
  });

  // Issue #31 : au repos en (45, −35, 60) le schéma des ciseaux était tranché par le bord droit des
  // vues front et top, au moment exact où elles apparaissent à l'écran pour la première fois.
  it.each(CAMERA_IDS)('draws the whole scissors glyph inside the %s view at load', (camId: CameraId) => {
    for (const point of glyphPoints()) {
      const [x, y] = projectToPixel(camId, world.cameras[camId], point);
      expect(x).toBeGreaterThan(MARGIN_PX);
      expect(x).toBeLessThan(VIEW_SIZE_PX - MARGIN_PX);
      expect(y).toBeGreaterThan(MARGIN_PX);
      expect(y).toBeLessThan(VIEW_SIZE_PX - MARGIN_PX);
    }
  });
});
