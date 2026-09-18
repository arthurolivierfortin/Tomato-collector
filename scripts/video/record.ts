/**
 * Enregistre une prise de la démo.
 *
 *   npx tsx scripts/video/record.ts --scenario concepts --mode replay --take concepts
 *   npx tsx scripts/video/record.ts --scenario cycle --mode live --take cycle
 *
 * Options : --scenario <concepts|cycle> | --scenario-file <json>, --mode <live|replay>,
 * --take <nom>, --page <url>, --api <url>, --episode <id ou chemin>, --out <dossier>.
 */
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { flag, opt, parseArgs } from './lib/cli';
import { isEpisodeFile, normalizeEntries, type ScriptEntry } from './lib/episodes';
import { fetchHealth, liveBlocker } from './lib/health';
import type { TakeMode } from './lib/markers';
import { parseScenario, scenarioMarkers, type Scenario } from './lib/scenario';
import { record } from './lib/recorder';
import { builtinScenario } from './scenarios';

const DEFAULTS = {
  page: 'http://localhost:5173',
  api: 'http://localhost:7331',
  out: 'data/video/takes',
  episodes: 'data/episodes',
};

function log(line: string): void {
  process.stdout.write(`${line}\n`);
}

async function loadScenario(args: ReturnType<typeof parseArgs>, mode: TakeMode): Promise<Scenario> {
  const file = opt(args, 'scenario-file', '');
  if (file !== '') return parseScenario(JSON.parse(await readFile(resolve(file), 'utf8')));
  return parseScenario(builtinScenario(opt(args, 'scenario', 'concepts'), mode));
}

/** `--episode` accepte un identifiant de `data/episodes/` ou un chemin de fichier complet. */
async function loadEpisode(id: string, dir: string): Promise<readonly ScriptEntry[]> {
  if (id === '') return [];
  const path = id.endsWith('.json') ? resolve(id) : resolve(dir, `${id}.json`);
  const parsed: unknown = JSON.parse(await readFile(path, 'utf8'));
  if (!isEpisodeFile(parsed)) throw new Error(`journal d’épisode invalide : ${path}`);
  const entries = normalizeEntries(parsed);
  log(`journal : ${path} — ${entries.length} messages, ${(entries[entries.length - 1]?.atMs ?? 0) / 1000} s`);
  return entries;
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const rawMode = opt(args, 'mode', 'replay');
  if (rawMode !== 'live' && rawMode !== 'replay') throw new Error(`--mode : « live » ou « replay », reçu « ${rawMode} »`);
  const scenario = await loadScenario(args, rawMode);
  const take = opt(args, 'take', scenario.name);
  const apiUrl = opt(args, 'api', DEFAULTS.api);
  const episode = await loadEpisode(opt(args, 'episode', ''), opt(args, 'episodes-dir', DEFAULTS.episodes));
  log(`prise « ${take} » — scénario « ${scenario.name} », mode ${scenario.mode}, ${scenario.steps.length} étapes`);
  log(`marqueurs prévus : ${scenarioMarkers(scenario).join(', ')}`);
  if (flag(args, 'dry-run')) {
    log('--dry-run : scénario valide, rien n’a été enregistré.');
    return;
  }
  if (scenario.mode === 'live') {
    const blocker = liveBlocker(await fetchHealth(apiUrl), apiUrl);
    if (blocker !== null) throw new Error(blocker);
    log(`serveur ${apiUrl} : prêt, aucune simulation connectée.`);
  }
  const result = await record({
    scenario,
    take,
    pageUrl: opt(args, 'page', DEFAULTS.page),
    apiUrl,
    outDir: opt(args, 'out', DEFAULTS.out),
    episode,
    log,
  });
  log(`vidéo    : ${result.videoPath}`);
  log(`marqueurs: ${result.markersPath} (${result.markers.markers.length}, prise de ${(result.markers.durationMs / 1000).toFixed(1)} s)`);
  if (result.pageErrors.length > 0) {
    log(`ATTENTION : ${result.pageErrors.length} erreur(s) dans la page : ${result.pageErrors.join(' | ')}`);
  }
  if (result.failure !== null) {
    // La prise est écrite et reste exploitable : le montage saura quels marqueurs manquent.
    log(`ÉCHEC : ${result.failure}`);
    log(`marqueurs manquants : ${result.markers.missing.join(', ') || 'aucun'}`);
    process.exitCode = 1;
  }
}

main().catch((e: unknown) => {
  process.stderr.write(`${e instanceof Error ? e.message : String(e)}\n`);
  process.exitCode = 1;
});
