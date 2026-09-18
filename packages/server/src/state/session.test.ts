import { createDefaultWorld, type Phase, type Tomato } from '@tomato/shared';
import { describe, expect, it } from 'vitest';
import { createFakeHub, createFakeSim, createMemoryJournal, type FakeHub, type FakeSim, type MemoryJournal } from '../testing/fakes';
import { createSession, episodeIdFor, type Session, type WakeEvent } from './session';

const tomato = (id: number): Tomato => ({
  id, state: 'ripe', ripeness: 1, positionCm: [10 * id, 0, 60], radiusCm: 3,
  stem: { fromCm: [10 * id, 0, 66], toCm: [10 * id, 0, 63] }, attached: true, visibleIn: { top: 1, front: 1, side: 1 },
});

function setup(): { hub: FakeHub; sim: FakeSim; journal: MemoryJournal; session: Session; phases: Phase[]; wakes: WakeEvent[]; logs: string[] } {
  const hub = createFakeHub();
  const sim = createFakeSim({ ...createDefaultWorld(1), tomatoes: [tomato(1), tomato(2)] });
  const journal = createMemoryJournal();
  const logs: string[] = [];
  const session = createSession(hub, { sim, journal, now: () => Date.UTC(2026, 8, 17, 10, 22, 33, 512), log: (l) => logs.push(l) });
  const phases: Phase[] = [];
  const wakes: WakeEvent[] = [];
  session.onPhase((p) => phases.push(p));
  session.onWake((w) => wakes.push(w));
  return { hub, sim, journal, session, phases, wakes, logs };
}

describe('episodeIdFor', () => {
  it('is a filename-safe timestamp plus the tomato id', () => {
    expect(episodeIdFor(Date.UTC(2026, 8, 17, 10, 22, 33, 512), 3)).toBe('2026-09-17T10-22-33-512Z-t3');
  });
});

describe('session', () => {
  it('ripe_detected while idle opens an episode: detected, set_target, wake, journal, broadcasts', () => {
    const { hub, sim, journal, session, wakes } = setup();
    session.handleSimEvent({ type: 'ripe_detected', tomatoId: 2, detector: 'hsv', confidence: 0.9 });
    const s = session.get();
    expect(s.phase).toBe('detected');
    expect(s.episodeId).toBe('2026-09-17T10-22-33-512Z-t2');
    expect(s.targetTomatoId).toBe(2);
    expect(s.lastEvent?.type).toBe('ripe_detected');
    expect(sim.applied).toEqual([{ type: 'set_target', tomatoId: 2 }]);
    expect(wakes).toEqual([{ tomatoId: 2, positionCm: [20, 0, 60], ripeness: 1 }]);
    expect(journal.current()).toBe(s.episodeId);
    expect(hub.broadcasts.map((m) => m.type)).toEqual(['sim_event', 'block_activity', 'phase', 'block_activity']);
    expect(hub.broadcasts[1]).toMatchObject({ from: 'perception', to: 'server' });
    expect(hub.broadcasts[2]).toEqual({ type: 'phase', phase: 'detected', reason: 'tomate 2 mûre' });
  });

  it('follows the nominal path through tool results and landing, then report closes to idle', () => {
    const { sim, journal, session, phases } = setup();
    session.handleSimEvent({ type: 'ripe_detected', tomatoId: 1, detector: 'yolo', confidence: 0.8 });
    expect(session.noteToolCall('get_views')).toBe(1);
    session.noteToolResult('get_views', true);
    expect(session.get().phase).toBe('detected');
    session.noteToolResult('move_basket', true);
    expect(session.get().phase).toBe('harvesting');
    session.noteToolResult('cut', false);
    expect(session.get().phase).toBe('harvesting');
    session.noteToolResult('cut', true);
    expect(session.get().phase).toBe('falling');
    session.handleSimEvent({ type: 'tomato_landed', tomatoId: 1, inBasket: true });
    expect(session.get().phase).toBe('harvested');
    expect(session.get().harvested).toBe(1);
    session.endEpisode('harvested', 'coupe nette');
    expect(session.get()).toMatchObject({ phase: 'idle', episodeId: null, targetTomatoId: null, toolCallsThisEpisode: 0 });
    expect(phases).toEqual(['detected', 'harvesting', 'cutting', 'falling', 'harvested', 'idle']);
    expect(journal.records).toHaveLength(1);
    expect(journal.records[0]).toMatchObject({ outcome: 'harvested', note: 'coupe nette', toolCalls: 1 });
    expect(sim.applied.at(-1)).toEqual({ type: 'set_target', tomatoId: null });
  });

  it('records missed, derives the real outcome from the phase, and aborts unfinished episodes', () => {
    const { session, journal, phases } = setup();
    session.handleSimEvent({ type: 'ripe_detected', tomatoId: 1, detector: 'hsv', confidence: 1 });
    session.noteToolResult('cut', true);
    session.handleSimEvent({ type: 'tomato_landed', tomatoId: 1, inBasket: false });
    expect(session.get().phase).toBe('missed');
    session.endEpisode('harvested', 'je crois que oui');
    expect(journal.records[0]).toMatchObject({ outcome: 'missed', note: '(déclaré harvested) je crois que oui' });
    expect(session.get().missed).toBe(1);

    session.handleSimEvent({ type: 'ripe_detected', tomatoId: 2, detector: 'hsv', confidence: 1 });
    session.noteToolResult('move_scissors', true);
    session.endEpisode('aborted', 'hors de portée');
    expect(journal.records[1]).toMatchObject({ outcome: 'aborted', note: 'hors de portée' });
    expect(phases.slice(-3)).toEqual(['harvesting', 'aborted', 'idle']);
  });

  it('queues detections outside idle and replays them at the end of the episode; new_plant clears the queue', () => {
    const { session, logs } = setup();
    session.handleSimEvent({ type: 'ripe_detected', tomatoId: 1, detector: 'hsv', confidence: 1 });
    session.handleSimEvent({ type: 'ripe_detected', tomatoId: 2, detector: 'hsv', confidence: 1 });
    session.handleSimEvent({ type: 'ripe_detected', tomatoId: 2, detector: 'hsv', confidence: 1 });
    session.handleSimEvent({ type: 'ripe_detected', tomatoId: 1, detector: 'hsv', confidence: 1 });
    expect(session.pendingDetections()).toEqual([2]);
    expect(logs.some((l) => l.includes('tomate 2 mise en attente'))).toBe(true);
    session.endEpisode('aborted', '');
    expect(session.get()).toMatchObject({ phase: 'detected', targetTomatoId: 2 });
    expect(session.pendingDetections()).toEqual([]);

    session.handleSimEvent({ type: 'ripe_detected', tomatoId: 1, detector: 'hsv', confidence: 1 });
    session.handleSimEvent({ type: 'plant_regenerated', seed: 5 });
    expect(session.pendingDetections()).toEqual([]);
  });

  it('never throws on invalid transitions, ignores landing outside falling, defers closing while falling', () => {
    const { session, logs } = setup();
    expect(session.setPhase('cutting', 'saut')).toBe(false);
    expect(logs.at(-1)).toContain('transition refusée idle → cutting');
    expect(session.startEpisode(1)).not.toBeNull();
    expect(session.startEpisode(2)).toBeNull();
    session.handleSimEvent({ type: 'tomato_landed', tomatoId: 1, inBasket: true });
    expect(session.get().phase).toBe('detected');
    session.noteToolResult('cut', true);
    session.endEpisode('aborted', 'agent parti pendant la chute');
    expect(session.get().phase).toBe('falling');
    session.handleSimEvent({ type: 'tomato_landed', tomatoId: 1, inBasket: true });
    expect(session.get().phase).toBe('idle');
    expect(session.get().harvested).toBe(1);
    session.endEpisode('aborted', 'rien à clore');
    expect(logs.at(-1)).toContain('aucun épisode');
    expect(session.noteToolCall('cut')).toBe(0);
  });
});
