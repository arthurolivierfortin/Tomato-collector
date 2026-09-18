import { createDefaultWorld } from '@tomato/shared';
import { describe, expect, it } from 'vitest';
import { createNoopRunner, loadAgentRunner, type AgentRunnerDeps } from './agentRunner';
import { createSession } from './state/session';
import { createFakeHub, createFakeSim, createMemoryJournal, type FakeHub } from './testing/fakes';

function deps(): AgentRunnerDeps & { hub: FakeHub } {
  const hub = createFakeHub();
  const sim = createFakeSim(createDefaultWorld(1));
  const session = createSession(hub, { sim, journal: createMemoryJournal() });
  return { hub, session, sim, mcpUrl: 'http://localhost:7331/mcp', model: 'claude-opus-5', systemPrompt: '' };
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
