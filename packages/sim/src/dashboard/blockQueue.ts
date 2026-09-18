import type { BlockFlow } from './dashboardTypes';

/**
 * Durée minimale d'allumage d'une flèche du schéma bloc (issue #23).
 *
 * La séquence perception → serveur puis serveur → agent arrive en quelques millisecondes : allumée
 * telle quelle, elle se réduit à un clignotement illisible. Chaque activité est donc tenue au moins
 * `BLOCK_MIN_MS`, les suivantes attendent leur tour dans une file, et le spectateur voit la chaîne
 * se dérouler dans l'ordre.
 */
export const BLOCK_MIN_MS = 1200;

/** Plafond de la file : une rafale ne doit pas faire défiler le schéma pendant une minute. */
export const BLOCK_QUEUE_MAX = 6;

/** Activité allumée, avec l'instant réel où elle l'a été. */
export interface LitFlow {
  flow: BlockFlow;
  atMs: number;
}

export interface BlockQueue {
  /** Activité affichée en ce moment, null quand le schéma est au repos. */
  current: LitFlow | null;
  /** Activités reçues en attente de leur tour, dans l'ordre d'arrivée. */
  pending: readonly BlockFlow[];
  /** Dernière activité reçue, même pas encore allumée : libellé du bandeau replié. */
  last: BlockFlow | null;
}

export function emptyQueue(): BlockQueue {
  return { current: null, pending: [], last: null };
}

/** Ajoute une activité : elle s'allume tout de suite si rien n'est en cours, sinon elle prend la file. */
export function enqueueFlow(q: BlockQueue, flow: BlockFlow, nowMs: number): BlockQueue {
  if (q.current === null) return { current: { flow, atMs: nowMs }, pending: q.pending, last: flow };
  return { current: q.current, pending: [...q.pending, flow].slice(-BLOCK_QUEUE_MAX), last: flow };
}

/**
 * Fait avancer la file si l'activité en cours a tenu sa durée minimale : la suivante s'allume, ou le
 * schéma s'éteint. Retourne l'état inchangé (même référence) quand il n'y a rien à faire.
 */
export function advanceQueue(q: BlockQueue, nowMs: number): BlockQueue {
  if (q.current === null) {
    const [next, ...rest] = q.pending;
    if (next === undefined) return q;
    return { current: { flow: next, atMs: nowMs }, pending: rest, last: q.last };
  }
  if (nowMs - q.current.atMs < BLOCK_MIN_MS) return q;
  const [next, ...rest] = q.pending;
  if (next === undefined) return { current: null, pending: [], last: q.last };
  return { current: { flow: next, atMs: nowMs }, pending: rest, last: q.last };
}

/** Délai en ms avant le prochain changement, ou null quand le schéma est au repos (aucun minuteur à poser). */
export function queueDueMs(q: BlockQueue, nowMs: number): number | null {
  if (q.current === null) return q.pending.length === 0 ? null : 0;
  return Math.max(0, BLOCK_MIN_MS - (nowMs - q.current.atMs));
}

/**
 * Délai à donner au minuteur du composant : l'échéance PLUS UNE milliseconde.
 *
 * `advanceQueue` n'avance qu'au-delà de `BLOCK_MIN_MS` (comparaison stricte) ; un minuteur armé pile
 * sur l'échéance retombe, à 1 ms près, sur un no-op — qui ne change pas l'état, donc ne relance pas
 * l'effet : la flèche resterait allumée jusqu'au prochain `block_activity`.
 */
export function advanceTimerMs(q: BlockQueue, nowMs: number): number | null {
  const due = queueDueMs(q, nowMs);
  return due === null ? null : due + 1;
}
