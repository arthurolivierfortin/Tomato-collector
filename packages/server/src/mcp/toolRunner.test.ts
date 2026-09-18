import { createDefaultWorld, ok } from '@tomato/shared';
import { describe, expect, it } from 'vitest';
import { createSession } from '../state/session';
import { createFakeHub, createFakeSim, createMemoryJournal } from '../testing/fakes';
import { DEFAULT_TOOL_PACING_MS } from '../config';
import { resultPayload } from './format';
import { createToolRunner } from './toolRunner';

/** Horloge factice : le temps n'avance que lorsque le runner attend. */
function fakeClock() {
  let ms = 0;
  const waits: number[] = [];
  return {
    now: () => ms,
    waits,
    wait: (delayMs: number): Promise<void> => {
      waits.push(delayMs);
      ms += delayMs;
      return Promise.resolve();
    },
    /** Fait avancer l'horloge, comme le ferait le travail réel d'un outil. */
    spend: (delayMs: number): void => {
      ms += delayMs;
    },
  };
}

function setup(clock: ReturnType<typeof fakeClock>, workMs = 0) {
  const hub = createFakeHub();
  const sim = createFakeSim(createDefaultWorld(1), (s, a) => {
    clock.spend(workMs);
    return ok(s, `${a.type} ok`);
  });
  const session = createSession(hub, { sim, journal: createMemoryJournal() });
  return { hub, session, sim };
}

const durations = (hub: ReturnType<typeof createFakeHub>): number[] =>
  hub.broadcasts.filter((m) => m.type === 'tool_call_result').map((m) => (m as { durationMs: number }).durationMs);

describe('createToolRunner (rythme minimal par appel)', () => {
  it('stretches a fast call to TOMATO_TOOL_PACING_MS between start and result', async () => {
    const clock = fakeClock();
    const { hub, session, sim } = setup(clock, 100);
    const run = createToolRunner({ sim, session, hub }, { now: clock.now, wait: clock.wait, pacingMs: 1500 });
    await run('open_scissors', {});
    expect(clock.waits).toEqual([1400]);
    expect(durations(hub)).toEqual([1500]);
  });

  it('does not wait when the call already took longer than the pacing', async () => {
    const clock = fakeClock();
    const { hub, session, sim } = setup(clock, 4000);
    const run = createToolRunner({ sim, session, hub }, { now: clock.now, wait: clock.wait, pacingMs: 1500 });
    await run('move_scissors', { x: 10, y: 0, z: 60, mode: 'absolute' });
    expect(clock.waits).toEqual([]);
    expect(durations(hub)).toEqual([4000]);
  });

  it('never delays report, so the episode closes at once', async () => {
    const clock = fakeClock();
    const { hub, session, sim } = setup(clock, 10);
    const run = createToolRunner({ sim, session, hub }, { now: clock.now, wait: clock.wait, pacingMs: 1500 });
    await run('report', { outcome: 'harvested', note: 'fini' });
    expect(clock.waits).toEqual([]);
    expect(durations(hub)).toEqual([0]); // aucun complément : le résultat part tout de suite
  });

  it('is disabled by default, so nothing slows the tests down', async () => {
    const clock = fakeClock();
    const { hub, session, sim } = setup(clock, 10);
    const run = createToolRunner({ sim, session, hub }, { now: clock.now, wait: clock.wait });
    await run('get_status', {});
    expect(clock.waits).toEqual([]);
    expect(DEFAULT_TOOL_PACING_MS).toBe(1500);
  });

  it('broadcasts tool_call_start before waiting and tool_call_result after', async () => {
    const clock = fakeClock();
    const { hub, session, sim } = setup(clock, 0);
    const run = createToolRunner({ sim, session, hub }, { now: clock.now, wait: clock.wait, pacingMs: 800 });
    const pending = run('open_scissors', {});
    expect(hub.broadcasts.some((m) => m.type === 'tool_call_start')).toBe(true);
    expect(hub.broadcasts.some((m) => m.type === 'tool_call_result')).toBe(false);
    await pending;
    expect(hub.broadcasts.some((m) => m.type === 'tool_call_result')).toBe(true);
    expect(clock.waits).toEqual([800]);
  });
});

// ─── Issue #22 : arguments complets et résultat structuré sans image dans tool_call_result ───

const PNG = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';

function setupRunner() {
  const hub = createFakeHub();
  const sim = createFakeSim(createDefaultWorld(1), (s, a) => ok(s, `${a.type} ok`));
  const session = createSession(hub, { sim, journal: createMemoryJournal() });
  return { hub, sim, session, run: createToolRunner({ sim, session, hub }) };
}

describe('resultPayload', () => {
  it('replaces every image block by a placeholder and parses JSON text blocks', () => {
    const payload = resultPayload([
      { type: 'text', text: 'Vue front — axes X→ Z↑ — 8 px/cm' },
      { type: 'image', data: PNG, mimeType: 'image/png' },
      { type: 'text', text: '{"simTimeS":3.5,"tomatoes":[]}' },
    ]);
    expect(payload).toEqual(['Vue front — axes X→ Z↑ — 8 px/cm', '<image 800×800>', { simTimeS: 3.5, tomatoes: [] }]);
    expect(JSON.stringify(payload)).not.toContain(PNG);
  });

  it('unwraps a single block and never returns a parsed scalar for a plain sentence', () => {
    expect(resultPayload([{ type: 'text', text: 'ok : moved' }])).toBe('ok : moved');
    expect(resultPayload([{ type: 'text', text: '42' }])).toBe('42');
    expect(resultPayload([])).toBeNull();
  });

});

describe('createToolRunner (arguments et résultat diffusés)', () => {
  it('broadcasts the full arguments on start and a structured, image-free result on completion', async () => {
    const { hub, sim, run } = setupRunner();
    sim.views = (cams) => ({ images: cams.map((camera) => ({ camera, pngBase64: PNG, widthPx: 800, heightPx: 800 })), json: { ...sim.state, tomatoes: [] } });
    await run('get_views', { cameras: ['front'] });

    const start = hub.broadcasts.find((m) => m.type === 'tool_call_start');
    expect(start).toMatchObject({ type: 'tool_call_start', tool: 'get_views', args: { cameras: ['front'] } });

    const done = hub.broadcasts.find((m) => m.type === 'tool_call_result');
    expect(done).toMatchObject({ type: 'tool_call_result', ok: true, summary: 'vues : front' });
    const payload = (done as { result?: unknown }).result;
    expect(Array.isArray(payload)).toBe(true);
    expect(JSON.stringify(payload)).not.toContain(PNG);
    expect(JSON.stringify(payload)).toContain('<image 800×800>');
    expect(payload).toContainEqual(expect.objectContaining({ simTimeS: expect.any(Number) }));
  });

  it('carries the error text of a failed call in the result', async () => {
    const { hub, run } = setupRunner();
    await run('move_scissors', { x: 1, y: 2 });
    const done = hub.broadcasts.find((m) => m.type === 'tool_call_result');
    expect(done).toMatchObject({ ok: false });
    expect(String((done as { result?: unknown }).result)).toMatch(/^invalid_argument : /);
  });
});
