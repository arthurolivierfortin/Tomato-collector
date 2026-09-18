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
