import { describe, expect, it } from 'vitest';
import { endCardFrom, episodeDurationMs, formatCostUsd, isEpisodeFile, newestEpisode, normalizeEntries } from './episodes';

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

describe('endCardFrom', () => {
  const journal = {
    episodeId: 'ep-3',
    startedAt: '2026-09-18T01:44:11.275Z',
    endedAt: '2026-09-18T01:45:09.244Z',
    outcome: 'harvested',
    toolCalls: 10,
    costUsd: 0.355,
    messages: [{ atMs: 0, message: { type: 'phase' } }],
  };

  it('lit le résultat, les appels, le coût et la durée dans le journal', () => {
    expect(endCardFrom(journal)).toEqual({ outcome: 'tomate récoltée', toolCalls: 10, cost: '0,35 $', durationS: 57.969 });
  });

  it('compte les appels d’outils quand le journal ne les résume pas', () => {
    // Journal sans résumé `toolCalls` : ils sont recomptés dans les messages.
    const reste: Omit<typeof journal, 'toolCalls'> & { toolCalls?: number } = { ...journal };
    delete reste.toolCalls;
    const sans = {
      ...reste,
      messages: [
        { atMs: 0, message: { type: 'tool_call_start' } },
        { atMs: 1, message: { type: 'tool_call_result' } },
        { atMs: 2, message: { type: 'tool_call_start' } },
      ],
    };
    expect(endCardFrom(sans).toolCalls).toBe(2);
  });

  it('retombe sur le dernier message quand les horodatages manquent', () => {
    expect(endCardFrom({ episodeId: 'x', outcome: 'missed', messages: [{ atMs: 0, message: {} }, { atMs: 4200, message: {} }] })).toMatchObject({
      outcome: 'tomate ratée',
      durationS: 4.2,
    });
  });

  it('refuse d’inventer un résultat absent', () => {
    expect(() => endCardFrom({ episodeId: 'x', messages: [] })).toThrow(/outcome/);
  });
});

describe('formatCostUsd', () => {
  it('écrit le montant à la française', () => {
    expect(formatCostUsd(0.3551)).toBe('0,36 $');
    expect(formatCostUsd(0)).toBe('0,00 $');
  });
});

describe('newestEpisode', () => {
  it('rend le journal le plus récent, en ignorant les autres fichiers', () => {
    expect(
      newestEpisode([
        { name: 'wake-3.log', modifiedMs: 99 },
        { name: 'a.json', modifiedMs: 10 },
        { name: 'b.json', modifiedMs: 30 },
      ]),
    ).toBe('b.json');
  });

  it('rend null quand le dossier ne contient aucun journal', () => {
    expect(newestEpisode([{ name: 'note.txt', modifiedMs: 1 }])).toBeNull();
    expect(newestEpisode([])).toBeNull();
  });
});
