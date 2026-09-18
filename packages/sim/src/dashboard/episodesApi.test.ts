import { afterEach, describe, expect, it, vi } from 'vitest';
import { fetchServerModel, isEpisodeFile, listEpisodes, loadEpisode, scriptDurationMs, toScript } from './episodesApi';

const file = {
  episodeId: 'e1',
  messages: [
    { atMs: 1300, message: { type: 'phase', phase: 'harvesting', reason: 'b' } as const },
    { atMs: 1000, message: { type: 'phase', phase: 'detected', reason: 'a' } as const },
    { atMs: 2000, message: { type: 'phase', phase: 'idle', reason: 'c' } as const },
  ],
};

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

describe('toScript', () => {
  it('sorts, rebases at 0 and scales by the speed', () => {
    const s = toScript(file, 2);
    expect(s.map((e) => e.atMs)).toEqual([0, 150, 500]);
    expect(s.map((e) => (e.message.type === 'phase' ? e.message.phase : ''))).toEqual(['detected', 'harvesting', 'idle']);
    expect(scriptDurationMs(s)).toBe(500);
    expect(toScript(file, 1).map((e) => e.atMs)).toEqual([0, 300, 1000]);
    expect(scriptDurationMs([])).toBe(0);
  });
});

describe('isEpisodeFile', () => {
  it('accepts the journal shape and rejects anything else', () => {
    expect(isEpisodeFile(file)).toBe(true);
    expect(isEpisodeFile({ episodeId: 'e', messages: [{ atMs: 'x', message: { type: 'phase' } }] })).toBe(false);
    expect(isEpisodeFile({ messages: [] })).toBe(false);
    expect(isEpisodeFile(null)).toBe(false);
  });
});

describe('HTTP helpers', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('listEpisodes keeps only well-formed summaries and loadEpisode validates the file', async () => {
    const fetchMock = vi.fn(async (url: string | URL | Request) => {
      const u = String(url);
      if (u.endsWith('/episodes')) return jsonResponse([{ episodeId: 'e1', startedAt: 's', outcome: 'harvested', tomatoId: 1 }, { nope: 1 }]);
      if (u.endsWith('/episodes/e1')) return jsonResponse(file);
      return jsonResponse({}, 404);
    });
    vi.stubGlobal('fetch', fetchMock);
    expect((await listEpisodes('http://x')).map((e) => e.episodeId)).toEqual(['e1']);
    expect((await loadEpisode('e1', 'http://x')).messages).toHaveLength(3);
    await expect(loadEpisode('missing', 'http://x')).rejects.toThrow(/404/);
  });

  it('fetchServerModel returns the model when /health exposes it, null otherwise', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse({ ok: true, model: 'claude-test' })));
    expect(await fetchServerModel('http://x')).toBe('claude-test');
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse({ ok: true })));
    expect(await fetchServerModel('http://x')).toBeNull();
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('ECONNREFUSED'); }));
    expect(await fetchServerModel('http://x')).toBeNull();
  });
});
