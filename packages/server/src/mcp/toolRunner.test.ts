import { createDefaultWorld, ok } from '@tomato/shared';
import { describe, expect, it } from 'vitest';
import { createSession } from '../state/session';
import { createFakeHub, createFakeSim, createMemoryJournal } from '../testing/fakes';
import { DEFAULT_TOOL_PACING_MS } from '../config';
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
