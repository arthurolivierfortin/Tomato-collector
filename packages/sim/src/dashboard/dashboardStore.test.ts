import { describe, expect, it } from 'vitest';
import { createDefaultWorld, type ServerToDashboard, type ViewsResult } from '@tomato/shared';
import { BLOCK_MIN_MS } from './blockQueue';
import { RAW_MAX, TRACE_MAX, createDashboardStore, initialDashboardState, reduce } from './dashboardStore';
import type { DashboardState } from './dashboardTypes';
import { ZOOM_MAX, ZOOM_MIN } from './lightbox';
import { isTraceExpanded } from './traceExpand';

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
    expect(s.viewsAt.front).toBe(T0);
    expect(s.viewsAt.top).toBeNull();
    expect(s.sim.simTimeS).toBe(3.5);
    expect(s.trace[0]?.title).toBe('Vues rendues : front');
  });

  // Issue #22 : move_camera ne diffuse qu'une caméra ; les deux autres doivent garder leur dernière image.
  it('a partial views message never clears the cameras it does not carry', () => {
    const all: ViewsResult = { ...views, images: (['top', 'front', 'side'] as const).map((camera) => ({ camera, pngBase64: `all-${camera}`, widthPx: 800, heightPx: 800 })) };
    const s = run([
      { type: 'views', episodeId: 'e1', result: all },
      { type: 'views', episodeId: 'e1', result: { ...views, images: [{ camera: 'side', pngBase64: 'side-2', widthPx: 800, heightPx: 800 }] } },
    ]);
    expect(s.views.top?.pngBase64).toBe('all-top');
    expect(s.views.front?.pngBase64).toBe('all-front');
    expect(s.views.side?.pngBase64).toBe('side-2');
    expect(s.viewsAt.side).toBe(T0 + 100);
    expect(s.viewsAt.top).toBe(T0);
  });

  it('features the camera the agent asked for last, and falls back to front', () => {
    expect(initialDashboardState().featured).toBe('front');
    const s = run([
      { type: 'tool_call_start', episodeId: 'e1', callId: 'c1', tool: 'get_views', args: { cameras: ['top'] } },
    ]);
    expect(s.featured).toBe('top');
    const s2 = run([{ type: 'tool_call_start', episodeId: 'e1', callId: 'c2', tool: 'move_camera', args: { camera: 'side', dz: 5 } }], s);
    expect(s2.featured).toBe('side');
    // Une demande des trois vues ne privilégie aucune caméra : la mise en avant ne bouge pas.
    const s3 = run([{ type: 'tool_call_start', episodeId: 'e1', callId: 'c3', tool: 'get_views', args: {} }], s2);
    expect(s3.featured).toBe('side');
    // Un message `views` d'une seule caméra (move_camera d'un journal ancien) met aussi en avant.
    const s4 = run([{ type: 'views', episodeId: 'e1', result: views }], s3);
    expect(s4.featured).toBe('front');
  });

  it('keeps the arguments and the structured result of a tool call for the JSON trace', () => {
    const s = run([
      { type: 'tool_call_start', episodeId: 'e1', callId: 'c1', tool: 'move_basket', args: { x: 17.3, y: -19.5, mode: 'absolute' } },
      { type: 'tool_call_result', episodeId: 'e1', callId: 'c1', ok: true, summary: 'panier en X 17,3', durationMs: 90, result: { ok: true, basket: { centerCm: [17.3, -19.5] } } },
    ]);
    expect(s.trace).toHaveLength(1);
    expect(s.trace[0]).toMatchObject({ kind: 'tool', tool: 'move_basket', args: { x: 17.3, y: -19.5, mode: 'absolute' }, ok: true });
    expect(s.trace[0]?.result).toEqual({ ok: true, basket: { centerCm: [17.3, -19.5] } });
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

  it('block_activity queues the flows in order and adds no trace entry', () => {
    const s = run([
      { type: 'block_activity', from: 'perception', to: 'server', label: 'ripe_detected' },
      { type: 'block_activity', from: 'server', to: 'dashboard', label: 'phase' },
      { type: 'block_activity', from: 'server', to: 'agent', label: 'réveil' },
    ]);
    expect(s.blocks.current).toEqual({ flow: { from: 'perception', to: 'server', label: 'ripe_detected' }, atMs: T0 });
    expect(s.blocks.pending.map((f) => f.label)).toEqual(['phase', 'réveil']);
    expect(s.trace).toEqual([]);
  });

  it('local_block_advance chains the queue after BLOCK_MIN_MS and is a no-op before', () => {
    const s = run([
      { type: 'block_activity', from: 'perception', to: 'server', label: 'ripe_detected' },
      { type: 'block_activity', from: 'server', to: 'agent', label: 'réveil' },
    ]);
    expect(reduce(s, { type: 'local_block_advance' }, T0 + BLOCK_MIN_MS - 1)).toBe(s);
    const next = reduce(s, { type: 'local_block_advance' }, T0 + BLOCK_MIN_MS);
    expect(next.blocks.current?.flow.label).toBe('réveil');
    expect(next.blocks.pending).toEqual([]);
  });

  it('agent_wake highlights the detection in the trace and arms the banner (issue #23)', () => {
    const s = run([{ type: 'agent_wake', episodeId: 'e1', tomatoId: 3, detector: 'hsv', confidence: 0.9, sessionResumed: true }]);
    expect(s.trace[0]).toMatchObject({
      kind: 'wake',
      title: 'Tomate 3 détectée (hsv, 0,90) → réveil de l’agent, session reprise',
      atMs: T0,
    });
    expect(s.wake).toEqual({ tomatoId: 3, detector: 'hsv', confidence: 0.9, sessionResumed: true, atMs: T0 });
    expect(s.rawSinceMs).toBe(T0);
  });

  it('agent_wake says « nouvelle session » when the agent starts fresh', () => {
    const s = run([{ type: 'agent_wake', episodeId: 'e1', tomatoId: 1, detector: 'manual', confidence: 1, sessionResumed: false }]);
    expect(s.trace[0]?.title).toBe('Tomate 1 détectée (manuel, 1,00) → réveil de l’agent, nouvelle session');
  });

  it('agent_raw appends raw lines in order, caps them and resets the buffer on a new episode', () => {
    let s = run([
      { type: 'agent_wake', episodeId: 'e1', tomatoId: 3, detector: 'hsv', confidence: 0.9, sessionResumed: false },
      { type: 'agent_raw', episodeId: 'e1', kind: 'init', line: 'session sess-1 · MCP robot : connected' },
      { type: 'agent_raw', episodeId: 'e1', kind: 'text', line: 'Je regarde les vues.' },
    ]);
    expect(s.raw.map((l) => [l.kind, l.text])).toEqual([
      ['init', 'session sess-1 · MCP robot : connected'],
      ['text', 'Je regarde les vues.'],
    ]);
    expect(s.raw[0]?.atMs).toBe(T0 + 100); // plus ancien en haut : c'est un terminal
    expect(s.trace).toHaveLength(1); // le flux brut n'encombre pas la trace

    const flood: ServerToDashboard[] = Array.from({ length: RAW_MAX + 20 }, (_, i) => ({ type: 'agent_raw', episodeId: 'e1', kind: 'text', line: `l${i}` }));
    s = run(flood, s);
    expect(s.raw).toHaveLength(RAW_MAX);
    expect(s.raw[RAW_MAX - 1]?.text).toBe(`l${RAW_MAX + 19}`);

    // Épisode suivant : le panneau repart vide, même sans message de réveil (vieux journaux).
    s = run([{ type: 'agent_raw', episodeId: 'e2', kind: 'init', line: 'session sess-2' }], s);
    expect(s.raw.map((l) => l.text)).toEqual(['session sess-2']);
  });

  it('snapshot reports the tomato that is ripening, for the status bar (issue #23)', () => {
    const tomatoes = [
      { ...world.tomatoes[0]!, id: 1, ripeness: 1, attached: false },
      { ...world.tomatoes[0]!, id: 2, ripeness: 0.62, attached: true },
      { ...world.tomatoes[0]!, id: 3, ripeness: 0, attached: true },
    ];
    const s = run([{ type: 'snapshot', state: { ...world, tomatoes }, phase: 'idle', episodeId: null }]);
    expect(s.ripening).toEqual({ tomatoId: 2, ripeness: 0.62 });
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
  it('toggles the interface flags and features a camera on click', () => {
    let s = initialDashboardState();
    s = reduce(s, { type: 'local_toggle_controls' });
    s = reduce(s, { type: 'local_toggle_agent_view' });
    s = reduce(s, { type: 'local_toggle_diagram' });
    s = reduce(s, { type: 'local_toggle_session' });
    s = reduce(s, { type: 'local_feature', camera: 'side' });
    expect(s.ui).toEqual({ controlsHidden: true, agentView: true, diagramOpen: false, sessionOpen: false, lightbox: null, traceOverrides: {} });
    expect(s.featured).toBe('side');
  });

  it('opens, moves and closes the lightbox with a bounded zoom', () => {
    let s = reduce(initialDashboardState(), { type: 'local_lightbox_open', camera: 'top' });
    expect(s.ui.lightbox).toEqual({ camera: 'top', zoom: 1, panXPx: 0, panYPx: 0 });
    s = reduce(s, { type: 'local_lightbox_view', zoom: 2.5, panXPx: -40, panYPx: 12 });
    expect(s.ui.lightbox).toEqual({ camera: 'top', zoom: 2.5, panXPx: -40, panYPx: 12 });
    s = reduce(s, { type: 'local_lightbox_view', zoom: 99, panXPx: 0, panYPx: 0 });
    expect(s.ui.lightbox?.zoom).toBe(ZOOM_MAX);
    s = reduce(s, { type: 'local_lightbox_view', zoom: 0.1, panXPx: 5, panYPx: 5 });
    expect(s.ui.lightbox).toEqual({ camera: 'top', zoom: ZOOM_MIN, panXPx: 0, panYPx: 0 }); // ×1 : recadré
    // Changer de caméra sans fermer remet le zoom à plat et met la caméra en avant.
    s = reduce(s, { type: 'local_lightbox_view', zoom: 3, panXPx: 20, panYPx: 0 });
    s = reduce(s, { type: 'local_lightbox_camera', camera: 'side' });
    expect(s.ui.lightbox).toEqual({ camera: 'side', zoom: 1, panXPx: 0, panYPx: 0 });
    expect(s.featured).toBe('side');
    s = reduce(s, { type: 'local_lightbox_close' });
    expect(s.ui.lightbox).toBeNull();
    // Fermer deux fois ne change rien (le store ne notifie pas).
    expect(reduce(s, { type: 'local_lightbox_close' })).toBe(s);
  });

  it('folds and unfolds a trace entry around its default state', () => {
    const s = run([
      { type: 'tool_call_start', episodeId: 'e', callId: 'c1', tool: 'cut', args: {} },
      { type: 'tool_call_result', episodeId: 'e', callId: 'c1', ok: true, summary: 'coupe', durationMs: 10 },
    ]);
    const id = s.trace[0]!.id;
    expect(isTraceExpanded(s, id)).toBe(true); // parmi les 3 derniers appels
    const folded = reduce(s, { type: 'local_toggle_trace', id });
    expect(isTraceExpanded(folded, id)).toBe(false);
    expect(isTraceExpanded(reduce(folded, { type: 'local_toggle_trace', id }), id)).toBe(true);
  });

  it('local_reset clears the episode data but keeps the views, ui, model and connection', () => {
    let s = run([{ type: 'agent_text', episodeId: 'e', text: 'x' }, { type: 'views', episodeId: 'e', result: views }]);
    s = reduce(s, { type: 'local_connection', connection: 'replay' });
    s = reduce(s, { type: 'local_model', model: 'claude-test' });
    s = reduce(s, { type: 'local_toggle_agent_view' });
    s = reduce(s, { type: 'local_toggle_trace', id: s.trace[0]!.id });
    s = reduce(s, { type: 'local_reset' });
    expect(s.trace).toEqual([]);
    // Issue #22 : une remise à zéro ne vide jamais les vignettes, elles seraient grises jusqu'au premier get_views.
    expect(s.views.front?.pngBase64).toBe('iVBOR');
    expect(s.connection).toBe('replay');
    expect(s.model).toBe('claude-test');
    expect(s.ui.agentView).toBe(true);
    // Les identifiants de trace repartent à 1 : garder les replis viserait les entrées du nouvel épisode.
    expect(s.nextTraceId).toBe(1);
    expect(s.ui.traceOverrides).toEqual({});
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
