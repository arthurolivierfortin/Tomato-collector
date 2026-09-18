import { createDefaultWorld, ok, type ActionResult, type CameraId, type ServerToDashboard, type ServerToSim, type SimAction, type SimEvent, type SimToServer, type ViewsResult, type WorldState } from '@tomato/shared';
import type { EpisodeJournal, EpisodeRecord } from '../episodes/journal';
import type { Hub, Snapshot } from '../hub/hub';
import type { SimBridge } from '../sim/simBridge';
import { emptyViews } from '../sim/viewsFallback';

/** Hub en mémoire : enregistre ce qui est envoyé et diffusé, laisse le test injecter des messages sim. */
export interface FakeHub extends Hub {
  sent: ServerToSim[];
  broadcasts: ServerToDashboard[];
  connected: boolean;
  emitSim(m: SimToServer): void;
  snapshot(): Snapshot;
}

export function createFakeHub(): FakeHub {
  const simListeners = new Set<(m: SimToServer) => void>();
  const broadcastListeners = new Set<(m: ServerToDashboard) => void>();
  let snapshot: () => Snapshot = () => ({ type: 'snapshot', state: createDefaultWorld(0), phase: 'idle', episodeId: null });
  const hub: FakeHub = {
    sent: [],
    broadcasts: [],
    connected: true,
    emitSim: (m) => {
      for (const fn of simListeners) fn(m);
    },
    snapshot: () => snapshot(),
    onSimMessage(fn) {
      simListeners.add(fn);
      return () => simListeners.delete(fn);
    },
    sendToSim(m) {
      if (!hub.connected) return false;
      hub.sent.push(m);
      return true;
    },
    broadcast(m) {
      hub.broadcasts.push(m);
      for (const fn of broadcastListeners) fn(m);
    },
    simConnected: () => hub.connected,
    close: () => Promise.resolve(),
    onBroadcast(fn) {
      broadcastListeners.add(fn);
      return () => broadcastListeners.delete(fn);
    },
    setSnapshot(fn) {
      snapshot = fn;
    },
    whenListening: () => Promise.resolve(0),
  };
  return hub;
}

/** Pont sim en mémoire : applique un réducteur scripté, expose les actions reçues. */
export interface FakeSim extends SimBridge {
  applied: SimAction[];
  state: WorldState;
  /** Réponse de renderViews ; null = aucune image (sim absente). */
  views: ((cameras: CameraId[]) => ViewsResult) | null;
  emit(e: SimEvent): void;
}

export function createFakeSim(initial: WorldState = createDefaultWorld(1), reduce?: (s: WorldState, a: SimAction) => ActionResult): FakeSim {
  const listeners = new Set<(e: SimEvent) => void>();
  const sim: FakeSim = {
    applied: [],
    state: initial,
    views: null,
    emit: (e) => {
      for (const fn of listeners) fn(e);
    },
    apply(action) {
      sim.applied.push(action);
      const r = reduce ? reduce(sim.state, action) : ok(sim.state, `${action.type} ok`);
      sim.state = r.state;
      return Promise.resolve(r);
    },
    renderViews: (cameras) => Promise.resolve(sim.views ? sim.views(cameras) : emptyViews(sim.state)),
    latestState: () => sim.state,
    onEvent(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
  };
  return sim;
}

/** Journal en mémoire (pas de disque). */
export interface MemoryJournal extends EpisodeJournal {
  records: EpisodeRecord[];
}

export function createMemoryJournal(): MemoryJournal {
  let open: EpisodeRecord | null = null;
  const journal: MemoryJournal = {
    records: [],
    open(episodeId, tomatoId) {
      open = { episodeId, tomatoId, startedAt: new Date(0).toISOString(), endedAt: null, outcome: null, note: '', messages: [], toolCalls: 0, costUsd: 0 };
    },
    record(message) {
      open?.messages.push({ atMs: 0, message });
    },
    close(outcome, note, toolCalls) {
      if (open) journal.records.push({ ...open, outcome, note, toolCalls, endedAt: new Date(0).toISOString() });
      open = null;
      return Promise.resolve();
    },
    current: () => open?.episodeId ?? null,
    list: () => Promise.resolve(journal.records.map((r) => ({ episodeId: r.episodeId, startedAt: r.startedAt, outcome: r.outcome, tomatoId: r.tomatoId }))),
    read: (id) => Promise.resolve(journal.records.find((r) => r.episodeId === id) ?? null),
    flush: () => Promise.resolve(),
  };
  return journal;
}
