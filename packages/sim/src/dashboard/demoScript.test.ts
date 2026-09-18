import { describe, expect, it } from 'vitest';
import { createDefaultWorld, type ViewsResult } from '@tomato/shared';
import { createDashboardStore } from './dashboardStore';
import { buildDemoScript } from './demoScript';

const world = createDefaultWorld(1);
const views: ViewsResult = {
  images: [{ camera: 'top', pngBase64: 'iVBOR', widthPx: 800, heightPx: 800 }],
  json: { simTimeS: 1, phase: 'idle', targetTomatoId: null, tomatoes: [], scissors: world.scissors, basket: world.basket, cameras: world.cameras, limits: world.limits },
};

describe('buildDemoScript', () => {
  it('is time-ordered, starts with a snapshot and ends back in idle after a harvested episode', () => {
    const s = buildDemoScript(views, world);
    for (let i = 1; i < s.length; i++) expect(s[i]!.atMs).toBeGreaterThanOrEqual(s[i - 1]!.atMs);
    expect(s[0]?.message.type).toBe('snapshot');
    const phases = s.flatMap((e) => (e.message.type === 'phase' ? [e.message.phase] : []));
    expect(phases).toEqual(['detected', 'harvesting', 'cutting', 'falling', 'harvested', 'idle']);
    const end = s.find((e) => e.message.type === 'episode_end')?.message;
    expect(end?.type === 'episode_end' && end.outcome).toBe('harvested');
  });

  it('includes the views message only when views are given, and every tool call gets a result', () => {
    expect(buildDemoScript(views, world).some((e) => e.message.type === 'views')).toBe(true);
    expect(buildDemoScript(null, world).some((e) => e.message.type === 'views')).toBe(false);
    const s = buildDemoScript(null, world);
    const starts = s.flatMap((e) => (e.message.type === 'tool_call_start' ? [e.message.callId] : []));
    const results = s.flatMap((e) => (e.message.type === 'tool_call_result' ? [e.message.callId] : []));
    expect(starts).toHaveLength(9);
    expect(results.sort()).toEqual(starts.slice().sort());
  });

  it('played through the store, yields one harvested, one highlighted error and the views', () => {
    const store = createDashboardStore();
    for (const e of buildDemoScript(views, world)) store.dispatch(e.message, e.atMs);
    const st = store.get();
    expect(st.counters.harvested).toBe(1);
    expect(st.views.top?.pngBase64).toBe('iVBOR');
    expect(st.trace.filter((t) => t.ok === false).map((t) => t.title)).toEqual(['Ciseaux → X 8, Y −2, Z 41']);
    expect(st.costUsd).toBeCloseTo(0.0421);
    expect(st.trace[0]?.title).toBe('Phase repos');
  });

  // Issue #23 partie C : le scénario doit montrer le réveil et le flux brut, ce que la capture Playwright vérifie à l'écran.
  it('wakes the agent and streams its raw session, so the panel and the banner have something to show', () => {
    const store = createDashboardStore();
    for (const e of buildDemoScript(views, world)) store.dispatch(e.message, e.atMs);
    const st = store.get();
    expect(st.wake).toMatchObject({ tomatoId: world.tomatoes[0]?.id ?? 1, detector: 'hsv', confidence: 0.9, sessionResumed: false });
    expect(st.trace.some((t) => t.kind === 'wake')).toBe(true);
    expect(st.raw.map((l) => l.kind)).toEqual(['init', 'text', 'tool_use', 'tool_result', 'tool_use', 'stderr', 'tool_use', 'result']);
    expect(st.raw[0]?.text).toContain('MCP robot : connected');
    // Le flux brut arrive après le réveil : les horodatages du panneau partent de là.
    expect(st.rawSinceMs).toBe(400);
  });
});
