import type { BasketPose, Tomato } from '@tomato/shared';
import { landingOutcome, shouldDecide } from './landing';
import type { PlantPhysics } from './physics';

export interface Landed {
  tomatoId: number;
  inBasket: boolean;
}

export interface FallTracker {
  /** Libère le corps de la tomate et démarre son chrono de chute ; false si elle tombe déjà. */
  release(tomato: Tomato): boolean;
  /** Cumule le temps de chute et renvoie les tomates décidées à cette frame (chacune une seule fois). */
  advance(dtS: number, tomatoes: readonly Tomato[], basket: BasketPose): Landed[];
  isFalling(id: number): boolean;
  reset(): void;
}

export function createFallTracker(physics: PlantPhysics): FallTracker {
  /** Temps de chute cumulé par tomate en cours de chute. */
  const airborne = new Map<number, number>();
  return {
    release(tomato) {
      if (airborne.has(tomato.id)) return false;
      physics.release(tomato.id, tomato.radiusCm);
      airborne.set(tomato.id, 0);
      return true;
    },
    advance(dtS, tomatoes, basket) {
      const landed: Landed[] = [];
      for (const [id, elapsed] of airborne) {
        const t = tomatoes.find((x) => x.id === id);
        if (!t) {
          airborne.delete(id);
          continue;
        }
        const total = elapsed + dtS;
        airborne.set(id, total);
        if (!shouldDecide(physics.speedOf(id), total)) continue;
        airborne.delete(id);
        landed.push({ tomatoId: id, inBasket: landingOutcome(t.positionCm, t.radiusCm, basket) === 'in_basket' });
      }
      return landed;
    },
    isFalling: (id) => airborne.has(id),
    reset: () => airborne.clear(),
  };
}
