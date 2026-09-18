/**
 * Monte la vidéo de démo à partir des prises et de leurs marqueurs.
 *
 *   npx tsx scripts/video/montage.ts
 *   npx tsx scripts/video/montage.ts --out data/video/dry-run.mp4 --frames 6
 *
 * Options : --takes <dossier>, --out <fichier>, --work <dossier>, --plan-file <json>,
 * --frames <n> --frames-dir <dossier> --frames-prefix <préfixe>, --skip-missing,
 * --outcome/--calls/--cost/--episode-duration pour les cartons de fin.
 */
import { readdir, readFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { entryClips, formatDurationS, totalDurationS, type Clip } from './lib/cuts';
import { DEFAULT_STYLE } from './lib/ffmpegFilters';
import { pickEncoder, probe } from './lib/ffmpegRun';
import { flag, opt, optNumber, parseArgs } from './lib/cli';
import { isTakeMarkers, type TakeMarkers } from './lib/markers';
import { resolvePlan, type MontagePlan, type PlanEntry } from './lib/plan';
import { concatClips, extractFrames, prepareWorkDir, renderClip, type RenderContext } from './lib/render';
import { demoPlan } from './plans/demo';

const DEFAULTS = { takes: 'data/video/takes', out: 'data/video/tomato-demo.mp4', work: 'data/video/work', frames: 'data/video/frames' };

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
    const drift = parsed.durationMs / 1000 - info.durationS;
    log(
      `prise « ${parsed.take} » : ${parsed.markers.length} marqueurs, ${info.durationS.toFixed(1)} s, ` +
        `${info.width}×${info.height}, ${info.fps.toFixed(1)} img/s${Math.abs(drift) > 1.5 ? ` — écart marqueurs/vidéo ${drift.toFixed(1)} s` : ''}`,
    );
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

async function buildPlan(args: ReturnType<typeof parseArgs>): Promise<MontagePlan> {
  const file = opt(args, 'plan-file', '');
  if (file !== '') return JSON.parse(await readFile(resolve(file), 'utf8')) as MontagePlan;
  return demoPlan({
    outcome: opt(args, 'outcome', 'récoltée'),
    toolCalls: optNumber(args, 'calls', 10),
    cost: opt(args, 'cost', '≈ 0,35 $'),
    durationS: optNumber(args, 'episode-duration', 58),
  });
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const takesDir = resolve(opt(args, 'takes', DEFAULTS.takes));
  const outPath = resolve(opt(args, 'out', DEFAULTS.out));
  const workDir = resolve(opt(args, 'work', DEFAULTS.work));
  const takes = await loadTakes(takesDir);
  const plan = keepAvailable(await buildPlan(args), takes, flag(args, 'skip-missing'));
  const clips: Clip[] = resolvePlan(plan, takes).flatMap(entryClips);
  log(`plan : ${plan.segments.length} entrées → ${clips.length} sous-plans, ${formatDurationS(totalDurationS(clips))} attendus`);

  const encoder = await pickEncoder();
  log(`encodeur : ${encoder}`);
  await prepareWorkDir(workDir);
  const ctx: RenderContext = {
    format: { width: plan.width, height: plan.height, fps: plan.fps },
    style: DEFAULT_STYLE,
    encoder,
    takesDir,
    workDir,
    videoOf: new Map([...takes].map(([name, t]) => [name, join(takesDir, t.video)])),
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
