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
  readonly startedAt?: string;
  readonly endedAt?: string;
}

/** Ce qu'affichent les cartons de fin. Aucune valeur n'est inventée : tout vient du journal. */
export interface EndCardData {
  readonly outcome: string;
  readonly toolCalls: number;
  /** `null` quand le journal ne donne pas de coût : le carton n'annonce alors aucun chiffre. */
  readonly cost: string | null;
  readonly durationS: number;
}

const OUTCOME_LABEL: Record<string, string> = {
  harvested: 'tomate récoltée',
  missed: 'tomate ratée',
  aborted: 'épisode abandonné',
};

/** Montant en français : virgule décimale, deux décimales, symbole après. */
export function formatCostUsd(usd: number): string {
  return `${usd.toFixed(2).replace('.', ',')} $`;
}

function countToolCalls(file: EpisodeFile): number {
  return file.messages.filter((e) => isRecord(e.message) && e.message['type'] === 'tool_call_start').length;
}

function durationS(file: EpisodeFile): number {
  const started = Date.parse(file.startedAt ?? '');
  const ended = Date.parse(file.endedAt ?? '');
  if (Number.isFinite(started) && Number.isFinite(ended) && ended > started) return (ended - started) / 1000;
  return episodeDurationMs(normalizeEntries(file)) / 1000;
}

/**
 * Cartons de fin d'un épisode réel. `outcome` manquant est une erreur : mieux vaut refuser de
 * monter que d'afficher un résultat inventé.
 */
export function endCardFrom(file: EpisodeFile): EndCardData {
  if (file.outcome === undefined) {
    throw new Error(`journal ${file.episodeId} : pas de « outcome », impossible d’écrire les cartons de fin`);
  }
  return {
    outcome: OUTCOME_LABEL[file.outcome] ?? file.outcome,
    toolCalls: file.toolCalls ?? countToolCalls(file),
    cost: file.costUsd === undefined || file.costUsd === 0 ? null : formatCostUsd(file.costUsd),
    durationS: durationS(file),
  };
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

export interface EpisodeCandidate {
  readonly name: string;
  readonly modifiedMs: number;
}

/**
 * Journal le plus récent d'un dossier : ce que `--episode latest` désigne, c'est-à-dire l'épisode
 * qui vient d'être filmé en direct. Rien n'est inventé, on lit un fichier réel.
 */
export function newestEpisode(files: readonly EpisodeCandidate[]): string | null {
  const journals = files.filter((f) => f.name.endsWith('.json'));
  if (journals.length === 0) return null;
  return journals.reduce((best, f) => (f.modifiedMs > best.modifiedMs ? f : best)).name;
}
