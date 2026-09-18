import type { Vec3 } from '@tomato/shared';

/**
 * Interpolations pures pour les mouvements animés de la sim (issue #21).
 * Tout le temps manipulé ici est du temps SIM (déjà mis à l'échelle par l'horloge, 0 en pause) :
 * une animation est donc naturellement gelée en pause et accélérée par `set_time_scale`.
 */
export interface Tween<T> {
  /** Avance de `dtS` secondes SIM et renvoie la valeur courante. */
  step(dtS: number): T;
  /** Valeur courante, sans avancer. */
  value(): T;
  /** Vrai dès que la cible est atteinte. */
  readonly done: boolean;
  /** Durée totale du mouvement, en secondes SIM. */
  readonly durationS: number;
}

/** Ramène un angle dans [-180, 180). */
const normalizeDeg = (d: number): number => ((((d + 180) % 360) + 360) % 360) - 180;

/** Écart le plus court de `fromDeg` vers `toDeg`, dans [-180, 180) : un demi-tour part en négatif. */
export function shortestDeltaDeg(fromDeg: number, toDeg: number): number {
  return normalizeDeg(toDeg - fromDeg);
}

/** Squelette commun : une horloge locale bornée par `durationS` et une fonction de valeur. */
function timeline<T>(durationS: number, at: (ratio: number) => T, end: T): Tween<T> {
  let elapsedS = 0;
  const value = (): T => (durationS <= 0 || elapsedS >= durationS ? end : at(elapsedS / durationS));
  return {
    durationS,
    get done() {
      return elapsedS >= durationS;
    },
    value,
    step(dtS) {
      if (dtS > 0) elapsedS = Math.min(durationS, elapsedS + dtS);
      return value();
    },
  };
}

/** Translation rectiligne à vitesse constante : durée = distance / vitesse. */
export function createTween(from: Vec3, to: Vec3, speedCmS: number): Tween<Vec3> {
  const delta: Vec3 = [to[0] - from[0], to[1] - from[1], to[2] - from[2]];
  const distanceCm = Math.hypot(delta[0], delta[1], delta[2]);
  const durationS = speedCmS > 0 ? distanceCm / speedCmS : 0;
  return timeline<Vec3>(durationS, (r) => [from[0] + delta[0] * r, from[1] + delta[1] * r, from[2] + delta[2] * r], to);
}

/** Rotation à vitesse constante par le plus court chemin ; les valeurs intermédiaires restent dans [-180, 180). */
export function createAngleTween(fromDeg: number, toDeg: number, speedDegS: number): Tween<number> {
  const deltaDeg = shortestDeltaDeg(fromDeg, toDeg);
  const durationS = speedDegS > 0 ? Math.abs(deltaDeg) / speedDegS : 0;
  return timeline<number>(durationS, (r) => normalizeDeg(fromDeg + deltaDeg * r), toDeg);
}

/** Interpolation linéaire sur une durée fixe (lames des ciseaux, zoom des caméras). */
export function createTimedTween(from: number, to: number, durationS: number): Tween<number> {
  return timeline<number>(durationS, (r) => from + (to - from) * r, to);
}

/** File d'attente sérielle : une tâche par outil à la fois, dans l'ordre d'arrivée. */
export interface Lane {
  run<T>(task: () => Promise<T>): Promise<T>;
}

export function createLane(): Lane {
  let tail: Promise<unknown> = Promise.resolve();
  return {
    run<T>(task: () => Promise<T>): Promise<T> {
      const next = tail.then(task, task);
      tail = next.then(
        () => undefined,
        () => undefined,
      );
      return next;
    },
  };
}
