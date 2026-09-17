import type { BasketPose, Vec3 } from '@tomato/shared';
import type { PlantPhysics } from './physics';

export const GRAVITY_CM_S2 = 981;

interface FakeBody {
  pos: [number, number, number];
  radius: number;
  vz: number;
  released: boolean;
}

/** Moteur analytique : chute verticale sous gravité, arrêt sur le fond du panier (XY dedans) ou sur le sol. */
export function createFakePhysics(): PlantPhysics {
  const bodies = new Map<number, FakeBody>();
  let basket: BasketPose | null = null;

  const restZ = (b: FakeBody): number => {
    if (basket) {
      const [cx, cy, floorZ] = basket.centerCm;
      const [w, d] = basket.sizeCm;
      if (Math.abs(b.pos[0] - cx) <= w / 2 && Math.abs(b.pos[1] - cy) <= d / 2) return floorZ + b.radius;
    }
    return b.radius;
  };

  return {
    attach(id, centerCm, radiusCm) {
      bodies.set(id, { pos: [centerCm[0], centerCm[1], centerCm[2]], radius: radiusCm, vz: 0, released: false });
    },
    release(id, radiusCm) {
      const b = bodies.get(id);
      if (!b) return;
      b.radius = radiusCm;
      b.released = true;
    },
    clear: () => bodies.clear(),
    step(dtS) {
      if (dtS <= 0) return;
      for (const b of bodies.values()) {
        if (!b.released) continue;
        b.vz -= GRAVITY_CM_S2 * dtS;
        b.pos[2] += b.vz * dtS;
        const floor = restZ(b);
        if (b.pos[2] <= floor) {
          b.pos[2] = floor;
          b.vz = 0;
        }
      }
    },
    positionOf(id) {
      const b = bodies.get(id);
      return b ? [b.pos[0], b.pos[1], b.pos[2]] : null;
    },
    speedOf: (id) => Math.abs(bodies.get(id)?.vz ?? 0),
    setBasket(next) {
      basket = next;
    },
    dispose: () => bodies.clear(),
  };
}
