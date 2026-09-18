import type { SimAction, WorldState } from '@tomato/shared';
import { createMotionRunner, type Motion, type MotionSpec } from '../core/animate';
import { createAngleTween, createLane, createTimedTween, createTween, type Lane } from '../core/animation';
import type { SimContext, SimModule } from '../core/module';
import { BASKET_SPEED_CM_S, BLADES_DURATION_S, SCISSORS_ROTATION_SPEED_DEG_S, SCISSORS_SPEED_CM_S } from '../core/speeds';
import { buildArmMesh } from './buildArmMesh';
import type { ArmMesh } from './buildArmMesh';
import { buildBasketMesh } from './buildBasketMesh';
import type { BasketMesh } from './buildBasketMesh';
import { solveIk } from './ik';
import { atRest } from './restPose';
import { closeAndCut, moveBasket, moveScissors, openScissors, rotateScissors } from './robotState';
import type { PlantObstacles } from './robotState';
import { poseFromAngles, scissorsPoints } from './scissorsGeometry';

/** Rayon de la tige principale tant que M1 n'a pas publié de PlantSpec (même valeur que generatePlant). */
const DEFAULT_STEM_RADIUS_CM = 1.1;

function obstacles(ctx: SimContext): PlantObstacles {
  const spec = ctx.registry.plantSpec;
  return {
    tomatoes: ctx.store
      .get()
      .tomatoes.filter((t) => t.attached)
      .map((t) => ({ id: t.id, positionCm: t.positionCm, radiusCm: t.radiusCm })),
    mainStem: spec?.mainStem ?? [],
    stemRadiusCm: spec?.stemRadiusCm ?? DEFAULT_STEM_RADIUS_CM,
  };
}

/** Ciseaux : translation à 15 cm/s, rotations à 45°/s, lames en 0,5 s ; la pose finale est posée telle quelle. */
function scissorsMotion(from: WorldState, to: WorldState): Motion {
  const a = from.scissors;
  const b = to.scissors;
  const cut = createTween(a.cutPointCm, b.cutPointCm, SCISSORS_SPEED_CM_S);
  const yaw = createAngleTween(a.yawDeg, b.yawDeg, SCISSORS_ROTATION_SPEED_DEG_S);
  const pitch = createAngleTween(a.pitchDeg, b.pitchDeg, SCISSORS_ROTATION_SPEED_DEG_S);
  const roll = createAngleTween(a.rollDeg, b.rollDeg, SCISSORS_ROTATION_SPEED_DEG_S);
  const opening = createTimedTween(a.openingDeg, b.openingDeg, a.openingDeg === b.openingDeg ? 0 : BLADES_DURATION_S);
  return {
    step(dtSimS, current) {
      const pose = poseFromAngles(cut.step(dtSimS), yaw.step(dtSimS), pitch.step(dtSimS), roll.step(dtSimS), opening.step(dtSimS));
      const done = cut.done && yaw.done && pitch.done && roll.done && opening.done;
      return { state: { ...current, scissors: done ? b : pose }, done };
    },
  };
}

/** Panier : glissement sur le rail à 15 cm/s. */
function basketMotion(from: WorldState, to: WorldState): Motion {
  const center = createTween(from.basket.centerCm, to.basket.centerCm, BASKET_SPEED_CM_S);
  return {
    step(dtSimS, current) {
      const next = center.step(dtSimS);
      return { state: { ...current, basket: center.done ? to.basket : { ...current.basket, centerCm: next } }, done: center.done };
    },
  };
}

/** Fabrique : un module par runtime, avec ses maillages et ses files de mouvement. */
export function createRobotModule(): SimModule {
  let arm: ArmMesh | null = null;
  let basket: BasketMesh | null = null;
  let shown: WorldState | null = null;
  let unlistenPlant: (() => void) | null = null;
  const motions = createMotionRunner();
  /** Une file par outil : une action animée attend la fin de la précédente sur le même outil. */
  const scissorsLane = createLane();
  const basketLane = createLane();

  const sync = (s: WorldState): void => {
    if (arm === null || basket === null) return;
    if (shown !== null && shown.scissors === s.scissors && shown.basket === s.basket) return;
    shown = s;
    const points = scissorsPoints(s.scissors);
    const angles = solveIk(s.limits.scissorsBaseCm, points.pivotCm);
    if (angles !== null) arm.pose(s.limits.scissorsBaseCm, angles, points);
    basket.pose(s.basket);
  };

  /** Ce que l'action demande : son réducteur, son interpolation et la file de son outil. */
  const plan = (action: SimAction, ctx: SimContext): { lane: Lane; spec: MotionSpec } | null => {
    switch (action.type) {
      case 'move_scissors':
        return {
          lane: scissorsLane,
          spec: { compute: (s) => moveScissors(s, action.x, action.y, action.z, action.mode, obstacles(ctx)), motion: scissorsMotion },
        };
      case 'rotate_scissors':
        return {
          lane: scissorsLane,
          spec: { compute: (s) => rotateScissors(s, action.yaw, action.pitch, action.roll, action.mode), motion: scissorsMotion },
        };
      case 'open_scissors':
        return { lane: scissorsLane, spec: { compute: openScissors, motion: scissorsMotion } };
      case 'cut': {
        // La règle de coupe est évaluée sur la pose de départ (seules les lames bougent pendant la
        // fermeture, donc le verdict est le même) ; le signal n'est émis qu'à lames fermées.
        let cutTomatoId: number | null = null;
        return {
          lane: scissorsLane,
          spec: {
            compute: (s) => {
              const c = closeAndCut(s, ctx.registry.plantSpec?.leaves ?? []);
              cutTomatoId = c.cutTomatoId;
              return c.result;
            },
            motion: scissorsMotion,
            onArrival: (c) => {
              if (cutTomatoId !== null) c.signals.emit({ type: 'tomato_cut', tomatoId: cutTomatoId });
            },
          },
        };
      }
      case 'move_basket':
        return { lane: basketLane, spec: { compute: (s) => moveBasket(s, action.x, action.y, action.mode), motion: basketMotion } };
      default:
        return null;
    }
  };

  return {
    name: 'robot',
    init(ctx) {
      // Issue #31 : un « Nouveau plant » entre deux prises doit retrouver le bras garé, pas là où
      // l'agent l'avait laissé devant le plant précédent.
      unlistenPlant?.();
      unlistenPlant = ctx.signals.on('plant_regenerated', () => ctx.store.update(atRest));
      if (ctx.scene === null) return;
      arm = buildArmMesh();
      basket = buildBasketMesh(ctx.store.get().basket);
      ctx.scene.addObject(arm.group);
      ctx.scene.addObject(basket.group);
      sync(ctx.store.get());
    },
    update(dtSimS, ctx) {
      motions.update(dtSimS, ctx);
      sync(ctx.store.get());
    },
    handle(action, ctx) {
      const p = plan(action, ctx);
      return p === null ? null : motions.now(ctx, p.spec);
    },
    handleAnimated(action, ctx) {
      const p = plan(action, ctx);
      return p === null ? null : motions.start(ctx, p.lane, p.spec);
    },
  };
}

export const robotModule: SimModule = createRobotModule();
