import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { ServerToDashboard } from '@tomato/shared';
import { silentLogger, type Logger } from '../log';
import type { EpisodeOutcome } from '../state/rules';

export interface JournalEntry {
  /** Millisecondes depuis le début de l'épisode. */
  atMs: number;
  message: ServerToDashboard;
}

export interface EpisodeRecord {
  episodeId: string;
  tomatoId: number;
  startedAt: string;
  endedAt: string | null;
  outcome: EpisodeOutcome | null;
  note: string;
  messages: JournalEntry[];
  toolCalls: number;
  costUsd: number;
}

export interface EpisodeSummary {
  episodeId: string;
  startedAt: string;
  outcome: EpisodeOutcome | null;
  tomatoId: number;
}

export interface EpisodeJournal {
  open(episodeId: string, tomatoId: number): void;
  /** Enregistre un message diffusé ; un `episode_end` est aiguillé par son `episodeId`, même si l'épisode suivant est déjà ouvert (coût). */
  record(message: ServerToDashboard): void;
  close(outcome: EpisodeOutcome, note: string, toolCalls: number): Promise<void>;
  current(): string | null;
  list(): Promise<EpisodeSummary[]>;
  read(episodeId: string): Promise<EpisodeRecord | null>;
  /** Attend la fin des écritures en cours (tests). */
  flush(): Promise<void>;
}

export const EPISODE_ID_PATTERN = /^[A-Za-z0-9_-]+$/;

function emptyRecord(episodeId: string, tomatoId: number, startedMs: number): EpisodeRecord {
  return {
    episodeId, tomatoId, startedAt: new Date(startedMs).toISOString(), endedAt: null,
    outcome: null, note: '', messages: [], toolCalls: 0, costUsd: 0,
  };
}

export function createEpisodeJournal(dir: string, opts: { now?: () => number; log?: Logger } = {}): EpisodeJournal {
  const now = opts.now ?? Date.now;
  const log = opts.log ?? silentLogger;
  let open: { record: EpisodeRecord; startedMs: number } | null = null;
  let lastClosed: EpisodeRecord | null = null;
  let writes: Promise<void> = Promise.resolve();

  const write = (record: EpisodeRecord): Promise<void> => {
    writes = writes
      .then(async () => {
        await mkdir(dir, { recursive: true });
        await writeFile(join(dir, `${record.episodeId}.json`), JSON.stringify(record));
      })
      .catch((e: unknown) => log(`journal: écriture impossible (${String(e)})`));
    return writes;
  };

  return {
    open(episodeId, tomatoId) {
      const startedMs = now();
      open = { startedMs, record: emptyRecord(episodeId, tomatoId, startedMs) };
    },
    record(message) {
      // `episode_end` arrive après la clôture (le runner le diffuse après `report`), et la session
      // a pu rouvrir un épisode entre-temps : on l'aiguille par son `episodeId`, jamais par « l'ouvert ».
      if (message.type === 'episode_end' && open?.record.episodeId !== message.episodeId) {
        if (lastClosed !== null && lastClosed.episodeId === message.episodeId) {
          lastClosed.costUsd = message.costUsd;
          lastClosed.messages.push({ atMs: now() - Date.parse(lastClosed.startedAt), message });
          void write(lastClosed);
        }
        return;
      }
      if (open) open.record.messages.push({ atMs: now() - open.startedMs, message });
    },
    close(outcome, note, toolCalls) {
      if (!open) return Promise.resolve();
      const { record } = open;
      open = null;
      record.endedAt = new Date(now()).toISOString();
      record.outcome = outcome;
      record.note = note;
      record.toolCalls = toolCalls;
      lastClosed = record;
      return write(record);
    },
    current: () => open?.record.episodeId ?? null,
    async list() {
      let files: string[];
      try {
        files = await readdir(dir);
      } catch {
        return [];
      }
      const out: EpisodeSummary[] = [];
      for (const f of files.filter((n) => n.endsWith('.json')).sort()) {
        try {
          const r = JSON.parse(await readFile(join(dir, f), 'utf8')) as EpisodeRecord;
          out.push({ episodeId: r.episodeId, startedAt: r.startedAt, outcome: r.outcome, tomatoId: r.tomatoId });
        } catch (e) {
          log(`journal: fichier ${f} illisible (${String(e)})`);
        }
      }
      return out;
    },
    async read(episodeId) {
      if (!EPISODE_ID_PATTERN.test(episodeId)) return null;
      try {
        return JSON.parse(await readFile(join(dir, `${episodeId}.json`), 'utf8')) as EpisodeRecord;
      } catch {
        return null;
      }
    },
    flush: () => writes,
  };
}
