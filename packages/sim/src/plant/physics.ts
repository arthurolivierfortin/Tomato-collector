import type { BasketPose, Vec3 } from '@tomato/shared';

/**
 * Adaptateur physique du plant. Deux implémentations : Rapier dans le navigateur
 * (rapierPhysics.ts) et un moteur analytique pour les tests Node (fakePhysics.ts).
 * Toutes les positions sont en cm dans le repère monde (Z haut).
 */
export interface PlantPhysics {
  /** Crée (ou recrée) le corps cinématique d'une tomate attachée, immobile à sa position monde. */
  attach(id: number, centerCm: Vec3, radiusCm: number): void;
  /** Coupe : le corps devient dynamique avec le rayon courant du fruit et tombe. */
  release(id: number, radiusCm: number): void;
  /** Supprime tous les corps de tomates (nouveau plant). */
  clear(): void;
  /** Avance la physique de dtS secondes sim (0 = rien). */
  step(dtS: number): void;
  /** Position monde du centre du fruit, null si inconnu. */
  positionOf(id: number): Vec3 | null;
  /** Norme de la vitesse en cm/s, 0 si inconnue. */
  speedOf(id: number): number;
  /** Repositionne le panier (fond, parois et capteur) depuis le store ; appelé à chaque frame. */
  setBasket(basket: BasketPose): void;
  dispose(): void;
}
