import type { ScriptEntry } from './bridgeTypes';

/** HTTP annexe du serveur M5 : GET /health, GET /episodes, GET /episodes/:id (contrat Étape 3). */
export const SERVER_HTTP_URL = import.meta.env.VITE_TOMATO_API_URL ?? 'http://localhost:7331';

export interface EpisodeSummary {
  episodeId: string;
  startedAt: string;
  outcome: string;
  tomatoId: number;
}

/** Sous-ensemble du fichier d'épisode utilisé par le replay. */
export interface EpisodeFile {
  episodeId: string;
  messages: ScriptEntry[];
}

function isRecord(x: unknown): x is Record<string, unknown> {
  return typeof x === 'object' && x !== null;
}

export function isEpisodeSummary(x: unknown): x is EpisodeSummary {
  return isRecord(x) && typeof x['episodeId'] === 'string';
}

export function isEpisodeFile(x: unknown): x is EpisodeFile {
  if (!isRecord(x) || typeof x['episodeId'] !== 'string' || !Array.isArray(x['messages'])) return false;
  return x['messages'].every(
    (e: unknown) => isRecord(e) && typeof e['atMs'] === 'number' && isRecord(e['message']) && typeof e['message']['type'] === 'string',
  );
}

/** Scénario rejouable : trié, ramené à 0 et accéléré du facteur `speed` (2 = deux fois plus vite). */
export function toScript(file: EpisodeFile, speed: number): ScriptEntry[] {
  const sorted = file.messages.slice().sort((a, b) => a.atMs - b.atMs);
  const first = sorted[0]?.atMs ?? 0;
  const k = speed > 0 ? 1 / speed : 1;
  return sorted.map((e) => ({ atMs: Math.round((e.atMs - first) * k), message: e.message }));
}

export function scriptDurationMs(script: readonly ScriptEntry[]): number {
  return script.reduce((max, e) => Math.max(max, e.atMs), 0);
}

export async function listEpisodes(baseUrl: string = SERVER_HTTP_URL): Promise<EpisodeSummary[]> {
  const res = await fetch(`${baseUrl}/episodes`);
  if (!res.ok) throw new Error(`GET /episodes : HTTP ${res.status}`);
  const body: unknown = await res.json();
  return Array.isArray(body) ? body.filter(isEpisodeSummary) : [];
}

export async function loadEpisode(episodeId: string, baseUrl: string = SERVER_HTTP_URL): Promise<EpisodeFile> {
  const res = await fetch(`${baseUrl}/episodes/${encodeURIComponent(episodeId)}`);
  if (!res.ok) throw new Error(`GET /episodes/${episodeId} : HTTP ${res.status}`);
  const body: unknown = await res.json();
  if (!isEpisodeFile(body)) throw new Error(`épisode ${episodeId} : fichier invalide`);
  return body;
}

/** Modèle annoncé par `GET /health` (`{ model }`) si le serveur l'expose ; sinon null. */
export async function fetchServerModel(baseUrl: string = SERVER_HTTP_URL): Promise<string | null> {
  try {
    const res = await fetch(`${baseUrl}/health`);
    if (!res.ok) return null;
    const body: unknown = await res.json();
    return isRecord(body) && typeof body['model'] === 'string' ? body['model'] : null;
  } catch {
    return null;
  }
}
