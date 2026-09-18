import { describe, expect, it } from 'vitest';
import { BLOCK_MIN_MS, BLOCK_QUEUE_MAX, advanceQueue, emptyQueue, enqueueFlow, queueDueMs } from './blockQueue';
import type { BlockFlow } from './dashboardTypes';

const T0 = 1_700_000_000_000;
const detect: BlockFlow = { from: 'perception', to: 'server', label: 'ripe_detected' };
const wake: BlockFlow = { from: 'server', to: 'agent', label: 'réveil' };
const phase: BlockFlow = { from: 'server', to: 'dashboard', label: 'phase' };

describe('blockQueue — file des activités du schéma bloc (issue #23)', () => {
  it('lights the first activity at once and keeps the next ones pending', () => {
    let q = enqueueFlow(emptyQueue(), detect, T0);
    expect(q.current).toEqual({ flow: detect, atMs: T0 });
    expect(q.pending).toEqual([]);
    q = enqueueFlow(q, phase, T0 + 50);
    q = enqueueFlow(q, wake, T0 + 100);
    expect(q.current).toEqual({ flow: detect, atMs: T0 });
    expect(q.pending).toEqual([phase, wake]);
    // Le bandeau replié annonce toujours la dernière activité reçue.
    expect(q.last).toEqual(wake);
  });

  it('holds each activity at least BLOCK_MIN_MS, then chains the next one', () => {
    let q = enqueueFlow(enqueueFlow(emptyQueue(), detect, T0), wake, T0 + 10);
    // Trop tôt : l'activité en cours reste allumée et l'état est inchangé (aucun rendu inutile).
    expect(advanceQueue(q, T0 + BLOCK_MIN_MS - 1)).toBe(q);
    q = advanceQueue(q, T0 + BLOCK_MIN_MS);
    expect(q.current).toEqual({ flow: wake, atMs: T0 + BLOCK_MIN_MS });
    expect(q.pending).toEqual([]);
    // Rien derrière : l'activité s'éteint une fois sa durée minimale écoulée.
    q = advanceQueue(q, T0 + 2 * BLOCK_MIN_MS);
    expect(q.current).toBeNull();
    expect(advanceQueue(q, T0 + 9_999)).toBe(q);
  });

  it('reports the delay before the next change, and null when nothing is lit', () => {
    expect(queueDueMs(emptyQueue(), T0)).toBeNull();
    const q = enqueueFlow(emptyQueue(), detect, T0);
    expect(queueDueMs(q, T0)).toBe(BLOCK_MIN_MS);
    expect(queueDueMs(q, T0 + 400)).toBe(BLOCK_MIN_MS - 400);
    expect(queueDueMs(q, T0 + 5_000)).toBe(0);
  });

  it('caps the pending list so a burst of messages never grows without bound', () => {
    let q = enqueueFlow(emptyQueue(), detect, T0);
    for (let i = 0; i < BLOCK_QUEUE_MAX + 5; i += 1) q = enqueueFlow(q, { ...wake, label: `w${i}` }, T0 + i);
    expect(q.pending).toHaveLength(BLOCK_QUEUE_MAX);
    // Les plus récentes sont gardées : le spectateur voit la fin de la rafale, pas son début.
    expect(q.pending[BLOCK_QUEUE_MAX - 1]?.label).toBe(`w${BLOCK_QUEUE_MAX + 4}`);
  });
});
