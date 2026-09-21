import { createDefaultWorld } from '@tomato/shared';
import type { ServerToDashboard, Tomato } from '@tomato/shared';
import { describe, expect, it } from 'vitest';
import { createNoopRunner, loadAgentRunner, startRunner, type AgentRunnerDeps } from './agentRunner';
import { createSession } from './state/session';
import { createFakeHub, createFakeSim, createMemoryJournal, type FakeHub, type FakeSim, type MemoryJournal } from './testing/fakes';

function deps(): AgentRunnerDeps & { hub: FakeHub; journal: MemoryJournal } {
  const hub = createFakeHub();
  const sim = createFakeSim(createDefaultWorld(1));
  const journal = createMemoryJournal();
  const session = createSession(hub, { sim, journal });
  return { hub, session, sim, journal, mcpUrl: 'http://localhost:7331/mcp', model: 'claude-opus-5', systemPrompt: '' };
}

describe('agent runner hook', () => {
  it('the no-op runner only logs wake-ups', () => {
    const logs: string[] = [];
    const runner = createNoopRunner((l) => logs.push(l));
    runner.wake({ tomatoId: 4, positionCm: [0, 0, 0], detector: 'manual', confidence: 1 });
    expect(runner.busy()).toBe(false);
    expect(logs).toEqual(['agent: désactivé, réveil ignoré (tomate 4)']);
  });

  it('falls back to the no-op runner when the M6 module is missing', async () => {
    const logs: string[] = [];
    const runner = await loadAgentRunner(deps(), (l) => logs.push(l), './agent/does-not-exist.js');
    expect(runner.busy()).toBe(false);
    expect(logs[0]).toMatch(/module \.\/agent\/does-not-exist\.js absent/);
  });

  it('loads a module exporting createAgentRunner and wires it to the session wake-ups', async () => {
    const d = deps();
    const runner = await loadAgentRunner(d, undefined, './testing/fakeAgent.js');
    d.session.onWake((e) => runner.wake(e));
    d.session.handleSimEvent({ type: 'ripe_detected', tomatoId: 2, detector: 'hsv', confidence: 1 });
    expect(runner.busy()).toBe(true);
    expect(d.hub.broadcasts.at(-1)).toMatchObject({ type: 'episode_start', tomatoId: 2 });
  });

  it('passes the sim bridge to the agent module so it can resolve tomatoes at wake-up', async () => {
    const d = deps();
    await loadAgentRunner(d, undefined, './testing/fakeAgent.js');
    const { lastDeps } = await import('./testing/fakeAgent.js');
    expect(lastDeps?.sim).toBe(d.sim);
    expect(lastDeps?.sim?.latestState()?.seed).toBe(1);
  });
});

describe('no-op runner staging (issue #29)', () => {
  const blocks = (hub: FakeHub): string[] =>
    hub.broadcasts.flatMap((m) => (m.type === 'block_activity' ? [`${m.from}→${m.to} ${m.label}`] : []));
  const wakes = (hub: FakeHub): ServerToDashboard[] => hub.broadcasts.filter((m) => m.type === 'agent_wake');

  it('opens the episode and emits agent_wake for a manual wake, without asking the SDK anything', () => {
    const d = deps();
    const logs: string[] = [];
    const runner = createNoopRunner((l) => logs.push(l), { hub: d.hub, session: d.session });
    d.session.onWake((e) => runner.wake(e));
    runner.wake({ tomatoId: 1, positionCm: [0, 0, 0], detector: 'manual', confidence: 1 });

    expect(d.session.get().phase).toBe('detected');
    expect(d.session.get().targetTomatoId).toBe(1);
    expect(d.journal.current()).toBe(d.session.get().episodeId);
    expect(blocks(d.hub)).toEqual([
      'perception→server tomate #1 mûre, manual 1,00',
      'server→dashboard phase detected',
      'server→agent réveil',
    ]);
    expect(wakes(d.hub)).toHaveLength(1);
    expect(d.hub.broadcasts.at(-1)).toMatchObject({ type: 'agent_wake', tomatoId: 1, detector: 'manual', sessionResumed: false });
    expect(logs.at(-1)).toMatch(/aucune requête au SDK/);
  });

  it('stages a detection the same way, without a second episode nor a second perception block', () => {
    const d = deps();
    const runner = createNoopRunner(undefined, { hub: d.hub, session: d.session });
    d.session.onWake((e) => runner.wake(e));
    d.session.handleSimEvent({ type: 'ripe_detected', tomatoId: 2, detector: 'hsv', confidence: 0.8 });

    expect(blocks(d.hub)).toEqual([
      'perception→server tomate #2 mûre, hsv 0,80',
      'server→dashboard phase detected',
      'server→agent réveil',
    ]);
    expect(wakes(d.hub)).toHaveLength(1);
    expect(d.hub.broadcasts.at(-1)).toMatchObject({ type: 'agent_wake', tomatoId: 2, detector: 'hsv', confidence: 0.8 });
  });

  it('ignores a wake for another tomato while an episode is open', () => {
    const d = deps();
    const logs: string[] = [];
    const runner = createNoopRunner((l) => logs.push(l), { hub: d.hub, session: d.session });
    runner.wake({ tomatoId: 1, positionCm: [0, 0, 0], detector: 'manual', confidence: 1 });
    runner.wake({ tomatoId: 2, positionCm: [0, 0, 0], detector: 'manual', confidence: 1 });
    expect(wakes(d.hub)).toHaveLength(1);
    expect(d.session.get().targetTomatoId).toBe(1);
    expect(logs.at(-1)).toMatch(/épisode en cours pour la tomate 1/);
  });
});

describe('startRunner: serveur de réveil toujours ouvert (issue #29)', () => {
  const tomato: Tomato = {
    id: 1,
    state: 'ripe',
    ripeness: 0.95,
    positionCm: [11, -3, 39],
    radiusCm: 3,
    stem: { fromCm: [9, -2, 43], toCm: [11, -3, 42] },
    attached: true,
    visibleIn: { top: 1, front: 1, side: 1 },
  };
  function withTomato(): AgentRunnerDeps & { hub: FakeHub; journal: MemoryJournal } {
    const d = deps();
    (d.sim as FakeSim).state = { ...createDefaultWorld(1), tomatoes: [tomato] };
    return d;
  }

  it('serves POST /wake even with the agent off, and stages the wake there', async () => {
    const d = withTomato();
    const handle = await startRunner(d, { agent: 'off', wakePort: 0 });
    d.session.onWake((e) => handle.runner.wake(e));
    try {
      expect(handle.wakePort).not.toBeNull();
      const r = await fetch(`http://127.0.0.1:${String(handle.wakePort)}/wake/1`, { method: 'POST' });
      expect(r.status).toBe(202);
      expect(await r.json()).toEqual({ ok: true, agent: 'off', tomatoId: 1 });
      expect(d.session.get().phase).toBe('detected');
      expect(d.session.get().targetTomatoId).toBe(1);
      expect(d.hub.broadcasts.at(-1)).toMatchObject({ type: 'agent_wake', tomatoId: 1, detector: 'manual' });
      expect(await (await fetch(`http://127.0.0.1:${String(handle.wakePort)}/wake`)).json()).toEqual({ busy: false, tomatoes: [1] });
    } finally {
      await handle.stop();
    }
    await expect(fetch(`http://127.0.0.1:${String(handle.wakePort)}/wake`)).rejects.toThrow();
  });

  it('owns the only wake server: the agent module is told not to open one', async () => {
    const d = withTomato();
    const handle = await startRunner(d, { agent: 'on', wakePort: 0, module: './testing/fakeAgent.js' });
    try {
      const { lastDeps } = await import('./testing/fakeAgent.js');
      expect(lastDeps?.wakePort).toBe(-1);
      const r = await fetch(`http://127.0.0.1:${String(handle.wakePort)}/wake/1`, { method: 'POST' });
      expect(await r.json()).toMatchObject({ queued: true, agent: 'on', tomatoId: 1 });
    } finally {
      await handle.stop();
    }
  });
});

describe('startRunner, mode visible', () => {
  it('charge le même module d’agent qu’en mode « on » et lui passe un flux à lui', async () => {
    const handle = await startRunner(deps(), {
      agent: 'visible',
      wakePort: -1,
      module: './testing/fakeAgent.js',
      visible: { title: 'Claude Code headless', cols: 110, rows: 32, x: 20, y: 20, dir: 'C:/tmp/cli', cwd: 'C:/repo', keep: false },
    });
    try {
      const { lastDeps } = await import('./testing/fakeAgent.js');
      // C'est bien l'agent complet, pas le runner inerte : seul le chemin du flux change.
      expect(lastDeps?.query).toBeTypeOf('function');
      expect(lastDeps?.mcpUrl).toBe('http://localhost:7331/mcp');
      expect(lastDeps?.wakePort).toBe(-1);
    } finally {
      await handle.stop();
    }
  });

  it('laisse le mode « on » sans flux injecté : c’est le SDK qui parle', async () => {
    const handle = await startRunner(deps(), { agent: 'on', wakePort: -1, module: './testing/fakeAgent.js' });
    try {
      const { lastDeps } = await import('./testing/fakeAgent.js');
      expect(lastDeps?.query).toBeUndefined();
    } finally {
      await handle.stop();
    }
  });
});

describe('startRunner, mode visible sans configuration', () => {
  it('échoue bruyamment plutôt que de retomber en silence sur le SDK', async () => {
    await expect(startRunner(deps(), { agent: 'visible', wakePort: -1, module: './testing/fakeAgent.js' })).rejects.toThrow(
      /visible.*fenêtre|fenêtre.*visible/i,
    );
  });
});
