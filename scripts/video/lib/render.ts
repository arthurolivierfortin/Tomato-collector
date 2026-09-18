/** Fabrication des sous-plans avec ffmpeg, puis concaténation. Les filtres viennent de `ffmpegFilters`. */
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { clipDurationS, type Clip } from './cuts';
import {
  captionFilters,
  chain,
  highlightFilter,
  CAPTION_MAX_LINES,
  escapeFilterPath,
  normalizeFilters,
  titleFilters,
  TITLE_BACKGROUND,
  type Format,
  type TextStyle,
} from './ffmpegFilters';
import { lineCount, wrapText } from './text';
import { encoderArgs, ffmpeg, type VideoInfo } from './ffmpegRun';

/** Largeurs de rupture, en caractères, calées sur les corps de `DEFAULT_STYLE` en 1920 px. */
const WRAP = { title: 40, subtitle: 78 } as const;

export interface RenderContext {
  readonly format: Format;
  readonly style: TextStyle;
  readonly encoder: 'h264_nvenc' | 'libx264';
  readonly takesDir: string;
  readonly workDir: string;
  /** Chemin du fichier vidéo de chaque prise, par nom de prise. */
  readonly videoOf: ReadonlyMap<string, string>;
  readonly warn: (line: string) => void;
}

function pad(i: number): string {
  return String(i).padStart(3, '0');
}

async function textFile(ctx: RenderContext, name: string, text: string): Promise<string> {
  const path = join(ctx.workDir, `${name}.txt`);
  // Sans saut de ligne final : drawtext compterait une ligne vide et décalerait le texte vers le haut.
  await writeFile(path, text, 'utf8');
  return path;
}

function sourceOf(ctx: RenderContext, take: string): string {
  const path = ctx.videoOf.get(take);
  if (path === undefined) throw new Error(`prise « ${take} » : fichier vidéo introuvable dans ${ctx.takesDir}`);
  return path;
}

async function renderTitle(ctx: RenderContext, i: number, clip: Extract<Clip, { kind: 'title' }>, out: string): Promise<void> {
  const titlePath = await textFile(ctx, `title-${pad(i)}`, wrapText(clip.text, WRAP.title));
  const subPath = clip.subtitle === undefined ? null : await textFile(ctx, `sub-${pad(i)}`, wrapText(clip.subtitle, WRAP.subtitle));
  const { width, height, fps } = ctx.format;
  await ffmpeg([
    '-f',
    'lavfi',
    '-i',
    `color=c=${TITLE_BACKGROUND}:s=${width}x${height}:r=${fps}:d=${clip.durationS}`,
    '-vf',
    chain([...titleFilters(titlePath, subPath, ctx.style), 'format=yuv420p']),
    '-t',
    String(clip.durationS),
    ...encoderArgs(ctx.encoder, fps),
    out,
  ]);
}

/** Nombre de caractères tenant dans un bandeau de `width` pixels, au corps du style. */
function wrapWidth(style: TextStyle, width: number): number {
  return Math.max(12, Math.floor((width - 4 * style.bandPadding) / (style.captionSize * 0.44)));
}

/** Cadre de mise en évidence puis bandeau : le cadre passe dessous, le texte reste lisible. */
async function overlayChain(ctx: RenderContext, i: number, clip: Extract<Clip, { kind: 'video' | 'freeze' }>): Promise<string[]> {
  const frame = clip.highlight === undefined ? [] : [highlightFilter(clip.highlight, ctx.style)];
  const caption = clip.caption;
  if (caption === undefined) return frame;
  const style: TextStyle = clip.captionWidth === undefined ? ctx.style : { ...ctx.style, captionWidth: clip.captionWidth };
  const wrapped = wrapText(caption, wrapWidth(style, style.captionWidth));
  const lines = lineCount(wrapped);
  if (lines > CAPTION_MAX_LINES) ctx.warn(`sous-titre sur ${lines} lignes, raccourcir : « ${caption} »`);
  const path = await textFile(ctx, `cap-${pad(i)}`, wrapped);
  return [...frame, ...captionFilters(path, style, lines)];
}

async function renderVideo(ctx: RenderContext, i: number, clip: Extract<Clip, { kind: 'video' }>, out: string): Promise<void> {
  await ffmpeg([
    '-ss',
    clip.fromS.toFixed(3),
    '-i',
    sourceOf(ctx, clip.take),
    '-t',
    (clip.toS - clip.fromS).toFixed(3),
    '-vf',
    chain([...normalizeFilters(ctx.format), ...(await overlayChain(ctx, i, clip))]),
    ...encoderArgs(ctx.encoder, ctx.format.fps),
    out,
  ]);
}

async function renderFreeze(ctx: RenderContext, i: number, clip: Extract<Clip, { kind: 'freeze' }>, out: string): Promise<void> {
  const still = join(ctx.workDir, `still-${pad(i)}.png`);
  await ffmpeg(['-ss', clip.atS.toFixed(3), '-i', sourceOf(ctx, clip.take), '-frames:v', '1', still]);
  await ffmpeg([
    '-loop',
    '1',
    '-framerate',
    String(ctx.format.fps),
    '-t',
    String(clip.durationS),
    '-i',
    still,
    '-vf',
    chain([...normalizeFilters(ctx.format), ...(await overlayChain(ctx, i, clip))]),
    ...encoderArgs(ctx.encoder, ctx.format.fps),
    out,
  ]);
}

export async function renderClip(ctx: RenderContext, i: number, clip: Clip): Promise<string> {
  const out = join(ctx.workDir, `clip-${pad(i)}.mp4`);
  if (clip.kind === 'title') await renderTitle(ctx, i, clip, out);
  else if (clip.kind === 'video') await renderVideo(ctx, i, clip, out);
  else await renderFreeze(ctx, i, clip, out);
  return out;
}

/**
 * Concaténation des sous-plans + une piste audio silencieuse (les lecteurs et les plateformes
 * n'aiment pas les mp4 sans son). Les sous-plans sortant tous du même encodeur, la vidéo est copiée.
 */
export async function concatClips(ctx: RenderContext, clips: readonly string[], outPath: string): Promise<void> {
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

export { clipDurationS, escapeFilterPath };
