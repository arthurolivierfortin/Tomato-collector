import { CAMERA_IDS, VIEW_SIZE_PX, createDefaultWorld, type CameraId, type Vec3 } from '@tomato/shared';
import { describe, expect, it } from 'vitest';
import { projectToPixel } from '../cameras/ortho';
import { scissorsPoints as glyphPointsOf } from '../cameras/scissorsGeometry';
import { createSignals } from '../core/signals';
import { createWorldStore } from '../core/store';
import type { SimContext } from '../core/module';
import { generatePlant } from '../plant/generatePlant';
import { radiusScale } from '../plant/ripening';
import { pathBlocked } from './collision';
import { armJoints, solveIk } from './ik';
import { isReachable } from './reach';
import { scissorsPoints as restPoints } from './scissorsGeometry';
import { createRobotModule } from './robotModule';
import { REST_CUT_POINT_CM, atRest } from './restPose';

/** Marge exigée entre le schéma des ciseaux et le bord de l'image, en pixels (bandeau haut compris). */
const MARGIN_PX = 48;
/** Graine de la page sim (`SEED` d'App.tsx) : point de départ de la suite du bouton « Nouveau plant ». */
const DEFAULT_PAGE_SEED = 20260917;

const world = atRest(createDefaultWorld(1));

/** Les points dessinés du schéma des ciseaux (pivot, pointes, croix, bouts des axes). */
function glyphPoints(): Vec3[] {
  const p = glyphPointsOf(world.scissors);
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
    expect(solveIk(scissorsBaseCm, glyphPointsOf(world.scissors).pivot)).not.toBeNull();
  });

  // Une prise de vue commence souvent par « Nouveau plant » : le bras doit revenir se garer, sinon il
  // reste là où l'agent l'avait laissé, devant le plant tout neuf.
  it('parks the scissors again when the plant is regenerated', () => {
    const ctx: SimContext = {
      store: createWorldStore(atRest(createDefaultWorld(1))),
      signals: createSignals(),
      emitEvent: () => undefined,
      scene: null,
      registry: { plantSpec: null },
    };
    const robot = createRobotModule();
    robot.init(ctx);
    ctx.store.update((s) => ({ ...s, scissors: { ...s.scissors, cutPointCm: [10, -20, 30] } }));
    expect(ctx.store.get().scissors.cutPointCm).toEqual([10, -20, 30]);

    ctx.signals.emit({ type: 'plant_regenerated', seed: 42 });
    expect(ctx.store.get().scissors.cutPointCm).toEqual(REST_CUT_POINT_CM);
  });

  // Le bouton « Nouveau plant » enchaîne les graines : la pose de repos doit rester bonne pour
  // toutes, pas seulement pour celle du chargement.
  it('stays clear of the plant and within the arm links over 50 successive seeds', () => {
    const { scissorsBaseCm: base, scissorsReachCm: reach } = world.limits;
    const p = restPoints(world.scissors);
    const angles = solveIk(base, p.pivotCm);
    expect(angles).not.toBeNull();
    const joints = armJoints(base, angles!);
    /** Le bras au repos, en segments : bras, avant-bras, puis les deux lames. */
    const segments: [Vec3, Vec3][] = [
      [joints.shoulderCm, joints.elbowCm],
      [joints.elbowCm, joints.wristCm],
      [p.pivotCm, p.tipACm],
      [p.pivotCm, p.tipBCm],
    ];

    let seed = DEFAULT_PAGE_SEED;
    for (let n = 0; n < 50; n++) {
      seed = (seed + 1) >>> 0; // même suite que `nextSeed` de plantModule
      const plant = generatePlant(seed);
      // Rayon du fruit mûr (×1,2) : la pose doit tenir quelle que soit la maturité du plant.
      const tomatoes = plant.tomatoes.map((t) => ({ id: t.id, positionCm: t.centerCm, radiusCm: t.radiusCm * radiusScale(1) }));
      expect(isReachable(base, reach, REST_CUT_POINT_CM)).toBe(true);
      for (const [a, b] of segments) {
        const hit = pathBlocked(a, b, tomatoes, plant.mainStem, plant.stemRadiusCm);
        expect(hit, `graine ${seed} : ${JSON.stringify(hit)}`).toEqual({ blocked: false });
      }
    }
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
