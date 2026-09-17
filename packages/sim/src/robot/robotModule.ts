import type { ActionResult, WorldState } from '@tomato/shared';
import type { SimContext, SimModule } from '../core/module';
import { buildArmMesh } from './buildArmMesh';
import type { ArmMesh } from './buildArmMesh';
import { buildBasketMesh } from './buildBasketMesh';
import type { BasketMesh } from './buildBasketMesh';
import { solveIk } from './ik';
import { closeAndCut, moveBasket, moveScissors, openScissors, rotateScissors } from './robotState';
import type { PlantObstacles } from './robotState';
import { scissorsPoints } from './scissorsGeometry';

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

function commit(ctx: SimContext, r: ActionResult): ActionResult {
  if (r.ok) ctx.store.set(r.state);
  return r;
}

/** Fabrique : un module par runtime, avec ses maillages. */
export function createRobotModule(): SimModule {
  let arm: ArmMesh | null = null;
  let basket: BasketMesh | null = null;
  let shown: WorldState | null = null;

  const sync = (s: WorldState): void => {
    if (arm === null || basket === null) return;
    if (shown !== null && shown.scissors === s.scissors && shown.basket === s.basket) return;
    shown = s;
    const points = scissorsPoints(s.scissors);
    const angles = solveIk(s.limits.scissorsBaseCm, points.pivotCm);
    if (angles !== null) arm.pose(s.limits.scissorsBaseCm, angles, points);
    basket.pose(s.basket);
  };

  return {
    name: 'robot',
    init(ctx) {
      if (ctx.scene === null) return;
      arm = buildArmMesh();
      basket = buildBasketMesh(ctx.store.get().basket);
      ctx.scene.addObject(arm.group);
      ctx.scene.addObject(basket.group);
      sync(ctx.store.get());
    },
    update(_dtSimS, ctx) {
      sync(ctx.store.get());
    },
    handle(action, ctx) {
      const s = ctx.store.get();
      switch (action.type) {
        case 'move_scissors':
          return commit(ctx, moveScissors(s, action.x, action.y, action.z, action.mode, obstacles(ctx)));
        case 'rotate_scissors':
          return commit(ctx, rotateScissors(s, action.yaw, action.pitch, action.roll, action.mode));
        case 'open_scissors':
          return commit(ctx, openScissors(s));
        case 'cut': {
          const { result, cutTomatoId } = closeAndCut(s, ctx.registry.plantSpec?.leaves ?? []);
          commit(ctx, result);
          if (cutTomatoId !== null) ctx.signals.emit({ type: 'tomato_cut', tomatoId: cutTomatoId });
          return result;
        }
        case 'move_basket':
          return commit(ctx, moveBasket(s, action.x, action.y, action.mode));
        default:
          return null;
      }
    },
  };
}

export const robotModule: SimModule = createRobotModule();
