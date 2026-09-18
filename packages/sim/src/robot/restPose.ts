import type { Vec3, WorldState } from '@tomato/shared';
import { poseFromAngles } from './scissorsGeometry';

/**
 * Point de coupe au repos de la sim (issue #31).
 *
 * `createDefaultWorld` (contrat `shared`, figé) pose les ciseaux en (45, −35, 60) : hors du champ de
 * 100 cm des vues front et top, le schéma des ciseaux y était tranché par le bord droit, et depuis la
 * caméra spectateur l'avant-bras passait juste devant le plant, masquant à demi la tomate mûre.
 *
 * Le bras se gare donc à droite du plant, au-dessus de l'épaule (le coude part alors vers l'extérieur
 * et non par-dessus le plant) et assez loin des bords pour que le schéma entier tienne dans les trois
 * vues au chargement.
 */
export const REST_CUT_POINT_CM: Vec3 = [35, -8, 62];

/** Monde initial de la page sim : même contenu que `createDefaultWorld`, ciseaux à la pose de repos. */
export function atRest(world: WorldState): WorldState {
  return { ...world, scissors: poseFromAngles(REST_CUT_POINT_CM, 0, 0, 0, 0) };
}
