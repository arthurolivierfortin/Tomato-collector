/**
 * Enregistre une prise de la démo.
 *
 *   npx tsx scripts/video/record.ts --scenario concepts --mode replay --take concepts
 *   npx tsx scripts/video/record.ts --scenario cycle --mode live --take cycle
 *
 * Options : --scenario <concepts|cycle> | --scenario-file <json>, --mode <live|replay>,
 * --take <nom>, --page <url>, --api <url>, --episode <id ou chemin>, --out <dossier>,
 * --terminal <page|gdigrab|window|off> (défaut : page), --terminal-log <fichier>,
 * --terminal-window <titre>, --terminal-inset <px>.
 *
 * `--terminal window` filme la **vraie fenêtre** où tourne Claude Code headless, ouverte par un
 * serveur lancé avec `TOMATO_AGENT=visible`. Le pilote ne l'ouvre pas et n'y écrit rien : il
 * l'attend par son titre, la met au-dessus de tout, la filme, puis la referme.
 */
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { flag, opt, parseArgs } from './lib/cli';
import { isEpisodeFile, normalizeEntries, type ScriptEntry } from './lib/episodes';
import { fetchHealth, liveBlocker } from './lib/health';
import type { TakeMode } from './lib/markers';
import { optionalMarkers, parseScenario, scenarioMarkers, type Scenario } from './lib/scenario';
import { record } from './lib/recorder';
import { parseTerminalMode } from './lib/terminal';
import { manualWindowNotice } from './lib/windowRect';
import { builtinScenario } from './scenarios';

const DEFAULTS = {
  page: 'http://localhost:5173',
  api: 'http://localhost:7331',
  out: 'data/video/takes',
  episodes: 'data/episodes',
  /** Même chemin que celui passé au serveur en `TOMATO_LOG_FILE` dans le README. */
  terminalLog: 'data/video/server.log',
  /** Titre posé par le serveur sur la fenêtre de l'agent visible (`TOMATO_VISIBLE_TITLE`). */
  terminalWindow: 'Claude Code headless',
};

/** `scripts/video/window-rect.ps1`, à côté de ce fichier. */
const WINDOW_SCRIPT = resolve(import.meta.dirname, 'window-rect.ps1');

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
  const terminalMode = parseTerminalMode(opt(args, 'terminal', 'page'));
  const terminalWindow = opt(args, 'terminal-window', DEFAULTS.terminalWindow);
  log(`prise « ${take} » — scénario « ${scenario.name} », mode ${scenario.mode}, ${scenario.steps.length} étapes`);
  log(`marqueurs prévus : ${scenarioMarkers(scenario).join(', ')}`);
  const optional = optionalMarkers(scenario);
  if (optional.length > 0) log(`marqueurs facultatifs (vanne) : ${optional.join(', ')}`);
  if (flag(args, 'dry-run')) {
    log('--dry-run : scénario valide, rien n’a été enregistré.');
    return;
  }
  if (scenario.mode === 'live') {
    const blocker = liveBlocker(await fetchHealth(apiUrl), apiUrl);
    if (blocker !== null) throw new Error(blocker);
    log(`serveur ${apiUrl} : neuf (phase idle), aucune simulation connectée.`);
  }
  // La fenêtre de l'agent n'est pas ouverte par le pilote : il l'attend. Autant dire tout de suite
  // ce qu'il attend, et ce que le propriétaire a à faire si elle tarde.
  if (terminalMode === 'window') log(manualWindowNotice(terminalWindow, 180));
  const result = await record({
    scenario,
    take,
    pageUrl: opt(args, 'page', DEFAULTS.page),
    apiUrl,
    outDir: opt(args, 'out', DEFAULTS.out),
    episode,
    terminalMode,
    terminalLog: resolve(opt(args, 'terminal-log', DEFAULTS.terminalLog)),
    terminalWindow,
    windowScript: WINDOW_SCRIPT,
    terminalInset: Number(opt(args, 'terminal-inset', '0')) || 0,
    log,
  });
  log(`vidéo    : ${result.videoPath}`);
  log(`marqueurs: ${result.markersPath} (${result.markers.markers.length}, prise de ${(result.markers.durationMs / 1000).toFixed(1)} s)`);
  const terminal = result.markers.terminal;
  if (terminal !== undefined) {
    log(`terminal : ${terminal.video} (${terminal.source ?? 'page'}), démarré à +${(terminal.startMs / 1000).toFixed(1)} s de la prise`);
  } else if (terminalMode !== 'off') {
    log('ATTENTION : aucune piste terminal ; le montage retirera l’incrustation et ses cartons.');
  }
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
