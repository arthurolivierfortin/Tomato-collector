import { describe, expect, it } from 'vitest';
import { episodeDurationMs, isEpisodeFile, normalizeEntries } from './episodes';

const file = {
  episodeId: 'ep-1',
  messages: [
    { atMs: 9000, message: { type: 'phase' } },
    { atMs: 4000, message: { type: 'episode_start' } },
    { atMs: 4000, message: { type: 'block_activity' } },
  ],
};

describe('isEpisodeFile', () => {
  it('reconnaît un journal de data/episodes/', () => {
    expect(isEpisodeFile(file)).toBe(true);
  });

  it('refuse ce qui n’en est pas un', () => {
    expect(isEpisodeFile({ episodeId: 'ep-1' })).toBe(false);
    expect(isEpisodeFile({ episodeId: 'ep-1', messages: [{ atMs: 'tôt', message: {} }] })).toBe(false);
    expect(isEpisodeFile(null)).toBe(false);
  });
});

describe('normalizeEntries', () => {
  it('trie les messages et ramène le premier à zéro : le replay démarre tout de suite', () => {
    expect(normalizeEntries(file).map((e) => e.atMs)).toEqual([0, 0, 5000]);
  });

  it('rend un journal vide sans exploser', () => {
    expect(normalizeEntries({ episodeId: 'vide', messages: [] })).toEqual([]);
    expect(episodeDurationMs([])).toBe(0);
  });
});

describe('episodeDurationMs', () => {
  it('rend l’instant du dernier message', () => {
    expect(episodeDurationMs(normalizeEntries(file))).toBe(5000);
  });
});
