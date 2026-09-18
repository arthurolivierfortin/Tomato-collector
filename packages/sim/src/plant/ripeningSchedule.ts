/**
 * Planificateur de maturité : UN seul fruit mûrit à la fois (issue #23).
 *
 * Le module plant garde l'identifiant du fruit en cours et l'instant sim où sa rampe démarre ;
 * ce fichier décide, sans état ni effet de bord, qui doit mûrir et à partir de quand.
 * Les temps sont comptés DEPUIS LE CHARGEMENT DU PLANT (`new_plant` remet le compteur à zéro).
 */

/** Départ de la toute première rampe, en secondes sim après le chargement du plant. */
export const FIRST_RIPENING_START_S = 3;
/** Attente entre la fin d'un fruit (coupé ou tombé) et le départ de la rampe du suivant. */
export const RIPENING_GAP_S = 4;

/** Ce que le planificateur a besoin de savoir d'une tomate. */
export interface ScheduledTomato {
  id: number;
  attached: boolean;
  ripeness: number;
}

export interface RipeningInput {
  /** Temps sim écoulé depuis le chargement du plant. */
  simTimeS: number;
  tomatoes: readonly ScheduledTomato[];
  /** Fruit en cours de mûrissement, tel que le module l'a retenu au tick précédent. */
  currentId: number | null;
}

export interface RipeningStart {
  /** Fruit qui doit mûrir maintenant, null si le plant n'a plus rien à offrir. */
  currentId: number | null;
  /** Instant sim du départ de sa rampe, ou null quand il n'y a rien de nouveau à planifier. */
  startAtS: number | null;
}

/** Un fruit reste candidat tant qu'il pend et qu'il n'est pas déjà arrivé au bout de sa rampe. */
function isCandidate(t: ScheduledTomato): boolean {
  return t.attached && t.ripeness < 1;
}

/**
 * Décide du prochain départ de rampe.
 *
 * - le fruit en cours garde sa place tant qu'il est attaché (même mûr : il attend d'être coupé) ;
 * - dès qu'il est détaché (coupé ou tombé), le suivant par id croissant démarre `RIPENING_GAP_S`
 *   plus tard ; le tout premier démarre à `FIRST_RIPENING_START_S` ;
 * - `startAtS = null` signifie « rien à changer », le module garde l'échéance déjà posée.
 */
export function nextRipeningStart(state: RipeningInput): RipeningStart {
  const current = state.currentId === null ? undefined : state.tomatoes.find((t) => t.id === state.currentId);
  if (current !== undefined && current.attached) return { currentId: state.currentId, startAtS: null };

  let next: ScheduledTomato | null = null;
  for (const t of state.tomatoes) {
    if (isCandidate(t) && (next === null || t.id < next.id)) next = t;
  }
  if (next === null) return { currentId: null, startAtS: null };

  // Un fruit détaché ou déjà entamé prouve que le plant a vécu : on n'est plus au tout premier départ.
  const started = state.tomatoes.some((t) => !t.attached || t.ripeness > 0);
  return { currentId: next.id, startAtS: started ? state.simTimeS + RIPENING_GAP_S : FIRST_RIPENING_START_S };
}
