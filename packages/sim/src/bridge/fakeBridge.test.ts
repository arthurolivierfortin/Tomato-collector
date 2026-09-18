import type { ServerToDashboard } from '@tomato/shared';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createFakeBridge } from './fakeBridge';

const script = [
  { atMs: 500, message: { type: 'phase', phase: 'harvesting', reason: 'b' } as ServerToDashboard },
  { atMs: 0, message: { type: 'phase', phase: 'detected', reason: 'a' } as ServerToDashboard },
  { atMs: 1000, message: { type: 'agent_text', episodeId: 'e', text: 'coupe' } as ServerToDashboard },
];

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe('createFakeBridge', () => {
  it('replays the script in time order and reports itself connected', () => {
    const bridge = createFakeBridge(script);
    const seen: string[] = [];
    bridge.onServerMessage((m) => seen.push(m.type === 'phase' ? m.phase : m.type));
    expect(bridge.status()).toBe('connected');
    vi.advanceTimersByTime(0);
    expect(seen).toEqual(['detected']);
    vi.advanceTimersByTime(499);
    expect(seen).toEqual(['detected']);
    vi.advanceTimersByTime(1);
    expect(seen).toEqual(['detected', 'harvesting']);
    vi.advanceTimersByTime(500);
    expect(seen).toEqual(['detected', 'harvesting', 'agent_text']);
    bridge.close();
  });

  // Issue #23 partie C : un journal récent porte le réveil et le flux brut de la session agent ;
  // le replay doit les rejouer comme les autres messages, et le dashboard les reçoit tels quels.
  it('replays agent_wake and agent_raw, and a log without them still plays', () => {
    const withRaw = [
      { atMs: 0, message: { type: 'agent_wake', episodeId: 'e', tomatoId: 3, detector: 'hsv', confidence: 0.9, sessionResumed: false } as ServerToDashboard },
      { atMs: 100, message: { type: 'agent_raw', episodeId: 'e', kind: 'init', line: 'session sess-1' } as ServerToDashboard },
      { atMs: 200, message: { type: 'agent_raw', episodeId: 'e', kind: 'result', line: 'coût 0,04 $' } as ServerToDashboard },
    ];
    const seen: ServerToDashboard[] = [];
    const bridge = createFakeBridge(withRaw);
    bridge.onServerMessage((m) => seen.push(m));
    vi.advanceTimersByTime(200);
    expect(seen.map((m) => m.type)).toEqual(['agent_wake', 'agent_raw', 'agent_raw']);
    expect(seen[1]).toMatchObject({ kind: 'init', line: 'session sess-1' });
    bridge.close();

    const old = createFakeBridge(script);
    const seenOld: string[] = [];
    old.onServerMessage((m) => seenOld.push(m.type));
    vi.advanceTimersByTime(1000);
    expect(seenOld).toEqual(['phase', 'phase', 'agent_text']);
    old.close();
  });

  it('honours the speed factor and close() cancels the rest', () => {
    const bridge = createFakeBridge(script, 2);
    const seen: string[] = [];
    const statuses: string[] = [];
    bridge.onServerMessage((m) => seen.push(m.type));
    bridge.onStatus((s) => statuses.push(s));
    vi.advanceTimersByTime(250);
    expect(seen).toEqual(['phase', 'phase']);
    bridge.close();
    vi.advanceTimersByTime(10_000);
    expect(seen).toEqual(['phase', 'phase']);
    expect(bridge.status()).toBe('disconnected');
    expect(statuses).toEqual(['disconnected']);
  });
});
