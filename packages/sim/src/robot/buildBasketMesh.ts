import { BoxGeometry, Group, Mesh, MeshStandardMaterial } from 'three';
import type { BasketPose } from '@tomato/shared';
import { worldToThree } from '../three/frame';

/** Palette (spec section 6) : panier jaune. */
const BASKET_COLOR = '#facc15';
const WALL_CM = 0.8;

export interface BasketMesh {
  group: Group;
  pose(basket: BasketPose): void;
}

/**
 * Boîte ouverte : fond + quatre parois. Repère local Three (X = X monde, Y = Z monde, Z = −Y monde),
 * origine du groupe au centre du fond (basket.centerCm, z = fond).
 */
export function buildBasketMesh(basket: BasketPose): BasketMesh {
  const [w, d] = basket.sizeCm;
  const h = basket.depthCm;
  const material = new MeshStandardMaterial({ color: BASKET_COLOR, roughness: 0.7 });
  const group = new Group();
  group.name = 'basket';
  const part = (sx: number, sy: number, sz: number, x: number, y: number, z: number): void => {
    const mesh = new Mesh(new BoxGeometry(sx, sy, sz), material);
    mesh.position.set(x, y, z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);
  };
  part(w, WALL_CM, d, 0, WALL_CM / 2, 0);
  part(w, h, WALL_CM, 0, h / 2, -d / 2);
  part(w, h, WALL_CM, 0, h / 2, d / 2);
  part(WALL_CM, h, d, -w / 2, h / 2, 0);
  part(WALL_CM, h, d, w / 2, h / 2, 0);
  return {
    group,
    pose(b) {
      group.position.copy(worldToThree(b.centerCm));
    },
  };
}
