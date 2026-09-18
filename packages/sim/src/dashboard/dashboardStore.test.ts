import { describe, expect, it } from 'vitest';
import { createDefaultWorld, type ServerToDashboard, type ViewsResult } from '@tomato/shared';
import { TRACE_MAX, createDashboardStore, initialDashboardState, reduce } from './dashboardStore';
import type { DashboardState } from './dashboardTypes';

const world = createDefaultWorld(1);
const T0 = 1_700_000_000_000;

const views: ViewsResult = {
  images: [{ camera: 'front', pngBase64: 'iVBOR', widthPx: 800, heightPx: 800 }],
  json: {
    simTimeS: 3.5, phase: 'idle', targetTomatoId: null, tomatoes: [],
    scissors: world.scissors, basket: world.basket, cameras: world.cameras, limits: world.limits,
  },
};

function run(messages: ServerToDashboard[], start: DashboardState = initialDashboardState()): DashboardState {
  return messages.reduce((s, m, i) => reduce(s, m, T0 + i * 100), start);
}

describe('reduce — messages serveur', () => {
  it('snapshot sets phase, sim clock, episode and logs one event', () => {
    const s = run([{ type: 'snapshot', state: { ...world, simTimeS: 12, timeScale: 5, paused: true, targetTomatoId: 4 }, phase: 'detected', episodeId: 'e1' }]);
    expect(s.phase).toBe('detected');
    expect(s.phaseAtMs).toBe(T0);
    expect(s.sim).toEqual({ simTimeS: 12, timeScale: 5, paused: true });
    expect(s.episode).toEqual({ id: 'e1', tomatoId: 4, startedAtMs: T0 });
    expect(s.trace.map((e) => e.kind)).toEqual(['event']);
  });

  it('phase logs a phase entry with the reason as detail', () => {
    const s = run([{ type: 'phase', phase: 'harvesting', reason: 'premier mouvement' }]);
    expect(s.phase).toBe('harvesting');
    expect(s.trace[0]).toMatchObject({ kind: 'phase', title: 'Phase récolte', detail: 'premier mouvement', atMs: T0 });
  });

  it('episode_start opens the episode; episode_end counts the outcome, adds the cost and closes it', () => {
    const s = run([
      { type: 'episode_start', episodeId: 'e1', tomatoId: 2, sessionResumed: false },
      { type: 'episode_end', episodeId: 'e1', outcome: 'missed', note: 'panier trop à gauche', toolCalls: 5, costUsd: 0.02, durationMs: 2500 },
      { type: 'episode_end', episodeId: 'e2', outcome: 'harvested', note: '', toolCalls: 7, costUsd: 0.03, durationMs: 4000 },
    ]);
    expect(s.episode).toBeNull();
    expect(s.counters).toEqual({ harvested: 1, missed: 1, aborted: 0 });
    expect(s.costUsd).toBeCloseTo(0.05);
    expect(s.trace[1]).toMatchObject({ kind: 'event', ok: false, detail: 'panier trop à gauche', durationMs: 2500 });
    expect(s.trace[0]).toMatchObject({ kind: 'event', ok: true });
    expect(s.trace[2]).toMatchObject({ kind: 'event', title: 'Épisode e1 : tomate 2, nouvelle session' });
  });

  it('agent_text keeps the first line as title and the whole text as detail when longer', () => {
    const s = run([
      { type: 'agent_text', episodeId: 'e1', text: 'Je regarde.' },
      { type: 'agent_text', episodeId: 'e1', text: 'Première ligne\nDeuxième ligne' },
    ]);
    expect(s.trace[1]).toMatchObject({ kind: 'text', title: 'Je regarde.' });
    expect(s.trace[1]?.detail).toBeUndefined();
    expect(s.trace[0]).toMatchObject({ kind: 'text', title: 'Première ligne', detail: 'Première ligne\nDeuxième ligne' });
  });

  it('tool_call_start adds a pending tool entry and tool_call_result completes it in place', () => {
    const s = run([
      { type: 'tool_call_start', episodeId: 'e1', callId: 'c1', tool: 'move_scissors', args: { x: 12, y: 4, z: 38, mode: 'absolute' } },
      { type: 'agent_text', episodeId: 'e1', text: 'entre-temps' },
      { type: 'tool_call_result', episodeId: 'e1', callId: 'c1', ok: false, summary: 'collision : X 9, Y 4, Z 40', durationMs: 180 },
    ]);
    expect(s.trace).toHaveLength(2);
    expect(s.trace[1]).toMatchObject({ kind: 'tool', title: 'Ciseaux → X 12, Y 4, Z 38', ok: false, detail: 'collision : X 9, Y 4, Z 40', durationMs: 180 });
  });

  it('an unmatched tool_call_result becomes its own entry', () => {
    const s = run([{ type: 'tool_call_result', episodeId: 'e1', callId: 'zz', ok: true, summary: 'ciseaux en X 8', durationMs: 40 }]);
    expect(s.trace[0]).toMatchObject({ kind: 'tool', title: 'ciseaux en X 8', ok: true, durationMs: 40 });
  });

  it('views stores each image by camera, stamps lastViewsAt and copies the sim time', () => {
    const s = run([{ type: 'views', episodeId: 'e1', result: views }]);
    expect(s.views.front?.pngBase64).toBe('iVBOR');
    expect(s.views.top).toBeNull();
    expect(s.lastViewsAt).toBe(T0);
    expect(s.sim.simTimeS).toBe(3.5);
    expect(s.trace[0]?.title).toBe('Vues rendues : front');
  });

  it('sim_event logs an event; tomato_landed carries ok = inBasket', () => {
    const s = run([
      { type: 'sim_event', event: { type: 'ripe_detected', tomatoId: 3, detector: 'yolo', confidence: 0.9 } },
      { type: 'sim_event', event: { type: 'tomato_landed', tomatoId: 3, inBasket: false } },
    ]);
    expect(s.trace[1]).toMatchObject({ kind: 'event', title: 'Tomate 3 mûre détectée (yolo, 0,90)' });
    expect(s.trace[1]?.ok).toBeUndefined();
    expect(s.trace[0]).toMatchObject({ kind: 'event', title: 'Tomate 3 tombée au sol', ok: false });
  });

  it('block_activity lights the target block with a flash timestamp and adds no trace entry', () => {
    const s = run([{ type: 'block_activity', from: 'server', to: 'agent', label: 'réveil' }]);
    expect(s.blocks).toEqual({ active: 'agent', flow: { from: 'server', to: 'agent', label: 'réveil' }, atMs: T0 });
    expect(s.trace).toEqual([]);
  });

  it('keeps the trace newest-first and capped at TRACE_MAX', () => {
    const msgs: ServerToDashboard[] = Array.from({ length: TRACE_MAX + 50 }, (_, i) => ({ type: 'agent_text', episodeId: 'e', text: `t${i}` }));
    const s = run(msgs);
    expect(s.trace).toHaveLength(TRACE_MAX);
    expect(s.trace[0]?.title).toBe(`t${TRACE_MAX + 49}`);
    expect(s.trace[TRACE_MAX - 1]?.title).toBe('t50');
    expect(s.nextTraceId).toBe(TRACE_MAX + 51);
  });
});

describe('reduce — messages locaux', () => {
  it('toggles the interface flags and the enlarged view', () => {
    let s = initialDashboardState();
    s = reduce(s, { type: 'local_toggle_controls' });
    s = reduce(s, { type: 'local_toggle_agent_view' });
    s = reduce(s, { type: 'local_toggle_diagram' });
    s = reduce(s, { type: 'local_enlarge', camera: 'side' });
    expect(s.ui).toEqual({ controlsHidden: true, agentView: true, diagramOpen: false, enlarged: 'side' });
  });

  it('local_reset clears the episode data but keeps ui, model and connection', () => {
    let s = run([{ type: 'agent_text', episodeId: 'e', text: 'x' }, { type: 'views', episodeId: 'e', result: views }]);
    s = reduce(s, { type: 'local_connection', connection: 'replay' });
    s = reduce(s, { type: 'local_model', model: 'claude-test' });
    s = reduce(s, { type: 'local_toggle_agent_view' });
    s = reduce(s, { type: 'local_reset' });
    expect(s.trace).toEqual([]);
    expect(s.views.front).toBeNull();
    expect(s.connection).toBe('replay');
    expect(s.model).toBe('claude-test');
    expect(s.ui.agentView).toBe(true);
  });
});

describe('createDashboardStore', () => {
  it('notifies subscribers on real changes only and exposes an immutable snapshot', () => {
    const store = createDashboardStore();
    let calls = 0;
    const off = store.subscribe(() => calls++);
    const before = store.get();
    store.dispatch({ type: 'local_connection', connection: 'disconnected' });
    expect(calls).toBe(0);
    expect(store.get()).toBe(before);
    store.dispatch({ type: 'phase', phase: 'detected', reason: 'r' }, T0);
    expect(calls).toBe(1);
    expect(store.get()).not.toBe(before);
    expect(store.get().trace[0]?.atMs).toBe(T0);
    off();
    store.dispatch({ type: 'phase', phase: 'harvesting', reason: 'r' });
    expect(calls).toBe(1);
  });
});
