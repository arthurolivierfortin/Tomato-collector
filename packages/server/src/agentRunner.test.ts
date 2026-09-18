import { createDefaultWorld } from '@tomato/shared';
import type { ServerToDashboard } from '@tomato/shared';
import { describe, expect, it } from 'vitest';
import { createNoopRunner, loadAgentRunner, type AgentRunnerDeps } from './agentRunner';
import { createSession } from './state/session';
import { createFakeHub, createFakeSim, createMemoryJournal, type FakeHub, type MemoryJournal } from './testing/fakes';

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
    runner.wake({ tomatoId: 4, positionCm: [0, 0, 0], ripeness: 1, detector: 'manual', confidence: 1 });
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
    runner.wake({ tomatoId: 1, positionCm: [0, 0, 0], ripeness: 1, detector: 'manual', confidence: 1 });

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
    runner.wake({ tomatoId: 1, positionCm: [0, 0, 0], ripeness: 1, detector: 'manual', confidence: 1 });
    runner.wake({ tomatoId: 2, positionCm: [0, 0, 0], ripeness: 1, detector: 'manual', confidence: 1 });
    expect(wakes(d.hub)).toHaveLength(1);
    expect(d.session.get().targetTomatoId).toBe(1);
    expect(logs.at(-1)).toMatch(/épisode en cours pour la tomate 1/);
  });
});
