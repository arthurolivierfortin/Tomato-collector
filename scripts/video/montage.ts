/**
 * Monte la vidéo de démo à partir des prises et de leurs marqueurs.
 *
 *   npx tsx scripts/video/montage.ts --episode data/episodes/<id>.json
 *   npx tsx scripts/video/montage.ts --episode <id>.json --out data/video/dry-run.mp4 --frames 6
 *
 * Options : --episode <journal> (obligatoire pour les cartons de fin), --takes <dossier>,
 * --out <fichier>, --work <dossier>, --plan-file <json>, --frames <n> --frames-dir --frames-prefix,
 * --skip-missing.
 */
import { existsSync } from 'node:fs';
import { readdir, readFile, stat } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { entryClips, formatDurationS, mergeShortSegments, totalDurationS, type Clip } from './lib/cuts';
import { isEpisodeFile, endCardFrom, newestEpisode } from './lib/episodes';
import { pickFontFile, DEFAULT_STYLE, FONT_CANDIDATES, type TextStyle } from './lib/ffmpegFilters';
import { pickEncoder, probe } from './lib/ffmpegRun';
import { flag, opt, optNumber, parseArgs, required } from './lib/cli';
import { isTakeMarkers, type TakeMarkers } from './lib/markers';
import { isMontagePlan, resolvePlan, type MontagePlan, type PlanEntry } from './lib/plan';
import { concatClips, extractFrames, prepareWorkDir, renderClip, type RenderContext } from './lib/render';
import { demoPlan } from './plans/demo';

const DEFAULTS = { takes: 'data/video/takes', out: 'data/video/tomato-demo.mp4', work: 'data/video/work' };
/** Sous-titre affiché moins longtemps : illisible. Les segments trop courts sont fusionnés. */
const MIN_CAPTION_S = 2.5;

function log(line: string): void {
  process.stdout.write(`${line}\n`);
}

async function loadTakes(dir: string): Promise<Map<string, TakeMarkers>> {
  const files = (await readdir(dir)).filter((f) => f.endsWith('.markers.json'));
  const takes = new Map<string, TakeMarkers>();
  for (const file of files) {
    const parsed: unknown = JSON.parse(await readFile(join(dir, file), 'utf8'));
    if (!isTakeMarkers(parsed)) throw new Error(`fichier de marqueurs invalide : ${join(dir, file)}`);
    takes.set(parsed.take, parsed);
    const info = await probe(join(dir, parsed.video));
    log(`prise « ${parsed.take} » : ${parsed.markers.length} marqueurs, ${info.durationS.toFixed(1)} s, ${info.width}×${info.height}, ${info.fps.toFixed(1)} img/s`);
    const missing = parsed.missing ?? [];
    if (missing.length > 0) log(`ATTENTION : prise « ${parsed.take} » incomplète, marqueurs manquants : ${missing.join(', ')}`);
    if (parsed.terminal !== undefined) {
      const source = parsed.terminal.source ?? 'page';
      log(`  terminal : ${parsed.terminal.video} (${source}), décalé de ${(parsed.terminal.startMs / 1000).toFixed(1)} s`);
      // Le carton de la partie 1 annonce « Claude Code, headless, live output » : il ne doit pas
      // se retrouver au-dessus d'une page qui suit un journal.
      if (source !== 'window') {
        log(`  ATTENTION : la prise « ${name} » a filmé « ${source} », pas la fenêtre de l’agent ; le carton du terminal serait faux.`);
      }
    }
  }
  if (takes.size === 0) throw new Error(`aucune prise dans ${dir} : lancer d’abord « npm run video:record »`);
  return takes;
}

/** Garde les entrées dont la prise est présente ; sans --skip-missing, une prise absente est une erreur. */
function keepAvailable(plan: MontagePlan, takes: ReadonlyMap<string, TakeMarkers>, skipMissing: boolean): MontagePlan {
  const missing = new Set<string>();
  const segments = plan.segments.filter((e: PlanEntry) => {
    if ('card' in e) return true;
    if (takes.has(e.take)) return true;
    missing.add(e.take);
    return false;
  });
  if (missing.size > 0) {
    if (!skipMissing) throw new Error(`prises absentes : ${[...missing].join(', ')} (ajouter --skip-missing pour monter quand même)`);
    log(`ATTENTION : prises absentes, segments ignorés : ${[...missing].join(', ')}`);
  }
  return { ...plan, segments };
}

/** `--episode latest` : le journal le plus récent du dossier, c'est-à-dire celui qu'on vient de filmer. */
async function resolveEpisodePath(episode: string, episodesDir: string): Promise<string> {
  if (episode !== 'latest') return resolve(episode);
  const dir = resolve(episodesDir);
  const entries = await readdir(dir, { withFileTypes: true });
  const candidates = await Promise.all(
    entries.filter((e) => e.isFile()).map(async (e) => ({ name: e.name, modifiedMs: (await stat(join(dir, e.name))).mtimeMs })),
  );
  const newest = newestEpisode(candidates);
  if (newest === null) throw new Error(`--episode latest : aucun journal dans ${dir}`);
  return join(dir, newest);
}

/** Les cartons de fin viennent du journal de l'épisode filmé : aucun chiffre n'est inventé. */
async function buildPlan(args: ReturnType<typeof parseArgs>): Promise<MontagePlan> {
  const file = opt(args, 'plan-file', '');
  if (file !== '') {
    const parsed: unknown = JSON.parse(await readFile(resolve(file), 'utf8'));
    if (!isMontagePlan(parsed)) throw new Error(`plan de montage invalide : ${resolve(file)}`);
    return parsed;
  }
  const episodePath = await resolveEpisodePath(required(args, 'episode'), opt(args, 'episodes-dir', 'data/episodes'));
  const journal: unknown = JSON.parse(await readFile(episodePath, 'utf8'));
  if (!isEpisodeFile(journal)) throw new Error(`journal d’épisode invalide : ${episodePath}`);
  const end = endCardFrom(journal);
  log(`cartons de fin, lus dans ${episodePath} : ${end.outcome}, ${end.toolCalls} appels, ${Math.round(end.durationS)} s, coût ${end.cost ?? 'non journalisé'}`);
  return demoPlan(end);
}

function resolveStyle(): TextStyle {
  const fontFile = pickFontFile(FONT_CANDIDATES, existsSync);
  if (fontFile === null) throw new Error(`aucune police trouvée parmi : ${FONT_CANDIDATES.join(', ')}`);
  log(`police : ${fontFile}`);
  return { ...DEFAULT_STYLE, fontFile };
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const takesDir = resolve(opt(args, 'takes', DEFAULTS.takes));
  const outPath = resolve(opt(args, 'out', DEFAULTS.out));
  const workDir = resolve(opt(args, 'work', DEFAULTS.work));
  const style = resolveStyle();
  const takes = await loadTakes(takesDir);
  const plan = keepAvailable(await buildPlan(args), takes, flag(args, 'skip-missing'));
  const entries = mergeShortSegments(resolvePlan(plan, takes, (line) => log(`ATTENTION : ${line}`)), MIN_CAPTION_S);
  const clips: Clip[] = entries.flatMap(entryClips);
  log(`plan : ${entries.length} entrées → ${clips.length} sous-plans, ${formatDurationS(totalDurationS(clips))} attendus`);

  const encoder = await pickEncoder();
  log(`encodeur : ${encoder}`);
  await prepareWorkDir(workDir);
  const ctx: RenderContext = {
    format: { width: plan.width, height: plan.height, fps: plan.fps },
    style,
    encoder,
    takesDir,
    workDir,
    videoOf: new Map([...takes].map(([name, t]) => [name, join(takesDir, t.video)])),
    terminalOf: new Map(
      [...takes].flatMap(([name, t]) =>
        t.terminal === undefined ? [] : [[name, { path: join(takesDir, t.terminal.video), startMs: t.terminal.startMs }] as const],
      ),
    ),
    warn: (line) => log(`ATTENTION : ${line}`),
  };
  const parts: string[] = [];
  for (const [i, clip] of clips.entries()) {
    parts.push(await renderClip(ctx, i, clip));
    const what = clip.kind === 'title' ? `carton « ${clip.text} »` : clip.kind === 'freeze' ? `arrêt sur image à ${clip.atS.toFixed(1)} s` : `plan ${clip.fromS.toFixed(1)}–${clip.toS.toFixed(1)} s`;
    log(`  ${String(i + 1).padStart(2, ' ')}/${clips.length} ${what}`);
  }
  await concatClips(ctx, parts, outPath);
  const info = await probe(outPath);
  log(`vidéo : ${outPath} — ${info.width}×${info.height}, ${info.fps.toFixed(1)} img/s, ${formatDurationS(info.durationS)}`);

  const count = optNumber(args, 'frames', 0);
  if (count > 0) {
    const dir = resolve(opt(args, 'frames-dir', join(dirname(outPath), 'frames')));
    const made = await extractFrames(outPath, info, dir, count, opt(args, 'frames-prefix', 'frame-'));
    log(`images : ${made.join('\n         ')}`);
  }
}

main().catch((e: unknown) => {
  process.stderr.write(`${e instanceof Error ? e.message : String(e)}\n`);
  process.exitCode = 1;
});
