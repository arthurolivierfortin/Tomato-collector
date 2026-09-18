/**
 * Ce qui se passe une fois tous les sous-plans rendus : le dossier de travail, la concaténation, et
 * les images extraites pour relire le montage sans le regarder en entier.
 */
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { ffmpeg, type VideoInfo } from './ffmpegRun';

function pad(i: number): string {
  return String(i).padStart(3, '0');
}

/** Ce dont la concaténation a besoin : le dossier de travail, rien d'autre. */
export interface ConcatContext {
  readonly workDir: string;
}

/**
 * Concaténation des sous-plans + une piste audio silencieuse (les lecteurs et les plateformes
 * n'aiment pas les mp4 sans son). Les sous-plans sortant tous du même encodeur, la vidéo est copiée.
 */
export async function concatClips(ctx: ConcatContext, clips: readonly string[], outPath: string): Promise<void> {
  const listPath = join(ctx.workDir, 'concat.txt');
  const lines = clips.map((p) => `file '${p.replace(/\\/g, '/').replace(/'/g, "'\\''")}'`);
  await writeFile(listPath, `${lines.join('\n')}\n`, 'utf8');
  await ffmpeg([
    '-f',
    'concat',
    '-safe',
    '0',
    '-i',
    listPath,
    '-f',
    'lavfi',
    '-i',
    'anullsrc=channel_layout=stereo:sample_rate=48000',
    '-c:v',
    'copy',
    '-c:a',
    'aac',
    '-b:a',
    '96k',
    '-shortest',
    '-movflags',
    '+faststart',
    outPath,
  ]);
}

export async function prepareWorkDir(dir: string): Promise<void> {
  await rm(dir, { recursive: true, force: true });
  await mkdir(dir, { recursive: true });
}

/** Six images réparties sur le film, pour relire le montage sans le regarder en entier. */
export async function extractFrames(videoPath: string, info: VideoInfo, outDir: string, count: number, prefix: string): Promise<string[]> {
  await mkdir(outDir, { recursive: true });
  const out: string[] = [];
  for (let i = 0; i < count; i += 1) {
    const at = (info.durationS * (i + 0.5)) / count;
    const path = join(outDir, `${prefix}${pad(i + 1)}.png`);
    await ffmpeg(['-ss', at.toFixed(3), '-i', videoPath, '-frames:v', '1', path]);
    out.push(path);
  }
  return out;
}

