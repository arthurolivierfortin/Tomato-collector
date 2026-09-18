import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createEpisodeJournal, type EpisodeJournal } from './journal';

let dir: string;
let clock = 1_000_000;
let journal: EpisodeJournal;

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'tomato-journal-'));
  clock = 1_000_000;
  journal = createEpisodeJournal(dir, { now: () => clock });
});

afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

describe('episode journal', () => {
  it('writes one JSON file per episode with timestamped messages and reads it back', async () => {
    journal.open('ep-1', 3);
    expect(journal.current()).toBe('ep-1');
    clock += 250;
    journal.record({ type: 'phase', phase: 'detected', reason: 'tomate 3 mûre' });
    clock += 100;
    journal.record({ type: 'tool_call_start', episodeId: 'ep-1', callId: 'c1', tool: 'cut', args: {} });
    await journal.close('harvested', 'coupe nette', 7);
    expect(journal.current()).toBeNull();

    const raw = JSON.parse(await readFile(join(dir, 'ep-1.json'), 'utf8')) as { messages: { atMs: number }[]; outcome: string };
    expect(raw.outcome).toBe('harvested');
    expect(raw.messages.map((m) => m.atMs)).toEqual([250, 350]);

    const record = await journal.read('ep-1');
    expect(record).not.toBeNull();
    expect(record!.tomatoId).toBe(3);
    expect(record!.toolCalls).toBe(7);
    expect(record!.note).toBe('coupe nette');
    expect(record!.startedAt).toBe(new Date(1_000_000).toISOString());
    expect(record!.endedAt).toBe(new Date(1_000_350).toISOString());
    expect(record!.messages[1]!.message.type).toBe('tool_call_start');
  });

  it('lists episodes as summaries, ignores messages outside an episode, and rejects unsafe ids', async () => {
    journal.record({ type: 'phase', phase: 'idle', reason: 'ignoré' });
    journal.open('ep-a', 1);
    await journal.close('missed', '', 2);
    journal.open('ep-b', 2);
    await journal.close('aborted', '', 0);
    expect(await journal.list()).toEqual([
      { episodeId: 'ep-a', startedAt: new Date(1_000_000).toISOString(), outcome: 'missed', tomatoId: 1 },
      { episodeId: 'ep-b', startedAt: new Date(1_000_000).toISOString(), outcome: 'aborted', tomatoId: 2 },
    ]);
    expect(await journal.read('../ep-a')).toBeNull();
    expect(await journal.read('nope')).toBeNull();
    expect((await journal.read('ep-a'))!.messages).toEqual([]);
  });

  it('patches the cost from a late episode_end of the episode that just closed', async () => {
    journal.open('ep-c', 4);
    await journal.close('harvested', 'ok', 5);
    journal.record({ type: 'episode_end', episodeId: 'ep-c', outcome: 'harvested', note: 'ok', toolCalls: 5, costUsd: 0.42, durationMs: 9000 });
    await journal.flush();
    const r = await journal.read('ep-c');
    expect(r!.costUsd).toBe(0.42);
    expect(r!.messages.at(-1)!.message.type).toBe('episode_end');
    journal.record({ type: 'episode_end', episodeId: 'other', outcome: 'missed', note: '', toolCalls: 0, costUsd: 9, durationMs: 1 });
    await journal.flush();
    expect((await journal.read('ep-c'))!.costUsd).toBe(0.42);
  });

  it('returns an empty list when the directory does not exist yet', async () => {
    expect(await createEpisodeJournal(join(dir, 'missing')).list()).toEqual([]);
  });
});
