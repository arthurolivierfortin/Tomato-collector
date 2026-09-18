/**
 * Vitesses des mouvements animés de la sim (issue #21), en temps SIM : le contrôle de vitesse
 * (`set_time_scale`) les multiplie donc directement, et la pause les gèle.
 * Seul point de réglage : tout le reste les importe.
 */

/** Translation du point de coupe des ciseaux. */
export const SCISSORS_SPEED_CM_S = 15;
/** Translation du panier sur son rail. */
export const BASKET_SPEED_CM_S = 15;
/** Lacet, tangage et roulis des ciseaux. */
export const SCISSORS_ROTATION_SPEED_DEG_S = 45;
/** Ouverture et fermeture des lames, durée fixe. */
export const BLADES_DURATION_S = 0.5;
/** Translation d'une caméra sur son rail. */
export const CAMERA_SPEED_CM_S = 20;
/** Pivot (lacet, tangage) d'une caméra. */
export const CAMERA_PIVOT_SPEED_DEG_S = 45;
/** Changement de champ (zoom) d'une caméra, durée fixe. */
export const CAMERA_ZOOM_DURATION_S = 0.5;
