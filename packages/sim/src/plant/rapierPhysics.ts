import RAPIER from '@dimforge/rapier3d-compat';
import type { Collider, RigidBody, World } from '@dimforge/rapier3d-compat';
import { Vector3 } from 'three';
import type { BasketPose, Vec3 } from '@tomato/shared';
import { threeToWorld, worldToThree } from '../three/frame';
import type { PlantPhysics } from './physics';

/** Gravité en cm/s², appliquée sur l'axe Y de Three (le haut). */
export const GRAVITY_CM_S2 = 981;
/** Pas fixe de la physique ; le dt sim de chaque frame est découpé en sous-pas. */
const FIXED_DT_S = 1 / 120;
/** Sous-pas maximum par frame : borne le coût quand timeScale est grand. */
const MAX_SUBSTEPS = 240;
const WALL_CM = 0.5;
/** Matériaux : paramètres de rendu physique du contact, pas des limites du contrat. */
/** Rebond d'une tomate : une tomate mûre rebondit peu. */
const TOMATO_RESTITUTION = 0.15;
/** Frottement d'une tomate sur le sol et sur le panier. */
const TOMATO_FRICTION = 0.7;
/** Frottement du sol et des parois du panier : assez rugueux pour que le fruit s'y arrête. */
const SURFACE_FRICTION = 0.8;
/** Densité du fruit (g/cm³) : proche de l'eau. */
const TOMATO_DENSITY = 1;
const FLOOR_THICKNESS_CM = 1;
const FLOOR_HALF_EXTENT_CM = 200;

interface TomatoBody {
  body: RigidBody;
  collider: Collider;
}

const toRapier = (v: Vec3): { x: number; y: number; z: number } => {
  const p = worldToThree(v);
  return { x: p.x, y: p.y, z: p.z };
};
const toWorld = (v: { x: number; y: number; z: number }): Vec3 => threeToWorld(new Vector3(v.x, v.y, v.z));

/** Panier : corps cinématique dont l'origine est le centre du fond (basket.centerCm) ; Y monde → −z Three. */
function createBasketBody(world: World, pose: BasketPose): RigidBody {
  const [w, d] = pose.sizeCm;
  const hw = w / 2;
  const hd = d / 2;
  const hh = pose.depthCm / 2;
  const body = world.createRigidBody(RAPIER.RigidBodyDesc.kinematicPositionBased());
  const solid = (hx: number, hy: number, hz: number, x: number, y: number, z: number): void => {
    world.createCollider(RAPIER.ColliderDesc.cuboid(hx, hy, hz).setTranslation(x, y, z).setFriction(SURFACE_FRICTION), body);
  };
  solid(hw + WALL_CM, FLOOR_THICKNESS_CM / 2, hd + WALL_CM, 0, -FLOOR_THICKNESS_CM / 2, 0);
  solid(WALL_CM / 2, hh, hd + WALL_CM, hw + WALL_CM / 2, hh, 0);
  solid(WALL_CM / 2, hh, hd + WALL_CM, -(hw + WALL_CM / 2), hh, 0);
  solid(hw + WALL_CM, hh, WALL_CM / 2, 0, hh, hd + WALL_CM / 2);
  solid(hw + WALL_CM, hh, WALL_CM / 2, 0, hh, -(hd + WALL_CM / 2));
  // Capteur volumique du panier (spec 4.1) : le volume intérieur, sans contact. La décision
  // harvested/missed reste la règle pure landingOutcome, appliquée sur la position du corps.
  world.createCollider(RAPIER.ColliderDesc.cuboid(hw, hh, hd).setTranslation(0, hh, 0).setSensor(true), body);
  return body;
}

/**
 * `RAPIER.init()` réinstancie le module WASM à chaque appel, ce qui invalide les corps
 * d'un monde déjà créé (React StrictMode monte la scène deux fois). Une seule initialisation par page.
 */
let rapierReady: Promise<void> | null = null;
const initRapier = (): Promise<void> => (rapierReady ??= RAPIER.init());

export async function createRapierPhysics(): Promise<PlantPhysics> {
  await initRapier();
  const world: World = new RAPIER.World({ x: 0, y: -GRAVITY_CM_S2, z: 0 });
  world.timestep = FIXED_DT_S;
  world.createCollider(
    RAPIER.ColliderDesc.cuboid(FLOOR_HALF_EXTENT_CM, 1, FLOOR_HALF_EXTENT_CM).setTranslation(0, -1, 0).setFriction(SURFACE_FRICTION),
  );

  const tomatoes = new Map<number, TomatoBody>();
  let basket: RigidBody | null = null;
  let accumulator = 0;

  return {
    attach(id, centerCm, radiusCm) {
      const prev = tomatoes.get(id);
      if (prev) world.removeRigidBody(prev.body);
      const p = toRapier(centerCm);
      const body = world.createRigidBody(
        RAPIER.RigidBodyDesc.kinematicPositionBased().setTranslation(p.x, p.y, p.z).setCcdEnabled(true),
      );
      const collider = world.createCollider(
        RAPIER.ColliderDesc.ball(radiusCm).setRestitution(TOMATO_RESTITUTION).setFriction(TOMATO_FRICTION).setDensity(TOMATO_DENSITY),
        body,
      );
      tomatoes.set(id, { body, collider });
    },
    release(id, radiusCm) {
      const t = tomatoes.get(id);
      if (!t) return;
      t.collider.setRadius(radiusCm);
      t.body.setBodyType(RAPIER.RigidBodyType.Dynamic, true);
      t.body.setLinvel({ x: 0, y: 0, z: 0 }, true);
      t.body.setAngvel({ x: 0, y: 0, z: 0 }, true);
    },
    clear() {
      for (const t of tomatoes.values()) world.removeRigidBody(t.body);
      tomatoes.clear();
      accumulator = 0;
    },
    step(dtS) {
      if (dtS <= 0) return;
      accumulator = Math.min(accumulator + dtS, FIXED_DT_S * MAX_SUBSTEPS);
      while (accumulator >= FIXED_DT_S) {
        world.step();
        accumulator -= FIXED_DT_S;
      }
    },
    positionOf(id) {
      const t = tomatoes.get(id);
      return t ? toWorld(t.body.translation()) : null;
    },
    speedOf(id) {
      const t = tomatoes.get(id);
      if (!t) return 0;
      const v = t.body.linvel();
      return Math.hypot(v.x, v.y, v.z);
    },
    setBasket(pose) {
      basket ??= createBasketBody(world, pose);
      basket.setNextKinematicTranslation(toRapier(pose.centerCm));
    },
    dispose() {
      tomatoes.clear();
      basket = null;
      world.free();
    },
  };
}
