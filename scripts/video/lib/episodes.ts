/**
 * Journaux d'épisode (`data/episodes/<id>.json`) : lecture du sous-ensemble utile au replay.
 * Le pont simulé de la page (`createFakeBridge`) attend exactement cette forme, ramenée à zéro.
 */

export interface ScriptEntry {
  readonly atMs: number;
  readonly message: unknown;
}

export interface EpisodeFile {
  readonly episodeId: string;
  readonly messages: readonly ScriptEntry[];
  readonly outcome?: string;
  readonly toolCalls?: number;
  readonly costUsd?: number;
}

function isRecord(x: unknown): x is Record<string, unknown> {
  return typeof x === 'object' && x !== null;
}

export function isEpisodeFile(x: unknown): x is EpisodeFile {
  if (!isRecord(x) || typeof x['episodeId'] !== 'string' || !Array.isArray(x['messages'])) return false;
  return x['messages'].every((e: unknown) => isRecord(e) && typeof e['atMs'] === 'number' && isRecord(e['message']));
}

/** Messages triés et rebasés sur zéro : la prise ne perd pas dix secondes d'attente au départ. */
export function normalizeEntries(file: EpisodeFile): ScriptEntry[] {
  const sorted = [...file.messages].sort((a, b) => a.atMs - b.atMs);
  const first = sorted[0]?.atMs ?? 0;
  return sorted.map((e) => ({ atMs: e.atMs - first, message: e.message }));
}

export function episodeDurationMs(entries: readonly ScriptEntry[]): number {
  return entries.reduce((max, e) => Math.max(max, e.atMs), 0);
}
