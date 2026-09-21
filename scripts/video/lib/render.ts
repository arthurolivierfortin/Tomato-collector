/** Fabrication des sous-plans avec ffmpeg, puis concaténation. Les filtres viennent de `ffmpegFilters`. */
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { clipDurationS, type Clip } from './cuts';
import {
  captionBackdropFilter,
  captionBandRect,
  captionFilters,
  captionWrapChars,
  chain,
  highlightFilter,
  pipComplex,
  CAPTION_BACKDROP_OPACITY,
  CAPTION_MAX_LINES,
  escapeFilterPath,
  normalizeFilters,
  titleFilters,
  TITLE_BACKGROUND,
  type Format,
  type TextStyle,
} from './ffmpegFilters';
import { splitComplex, splitLayout, type SplitSpec } from './split';
import { lineCount, wrapText } from './text';
import { signatureBlocks, signatureChain, type PlacedText } from './titleCard';
import { zoomChain, zoomLayout, zoomLines, zoomWrapChars, type ZoomBlock, type ZoomSpec } from './zoom';
import { terminalOffsetS } from './terminal';
import { encoderArgs, ffmpeg } from './ffmpegRun';

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
  /** Capture du terminal de chaque prise, avec son décalage sur l'horloge de la prise. */
  readonly terminalOf: ReadonlyMap<string, { readonly path: string; readonly startMs: number }>;
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

/**
 * Carton de signature : trois corps empilés (titre, ligne d'auteur, sous-texte) et un fondu au
 * noir. La pile est calculée par `signatureBlocks`, en pixels : ffmpeg ne place rien ici.
 */
async function renderSignature(ctx: RenderContext, i: number, clip: Extract<Clip, { kind: 'title' }>, byline: string, out: string): Promise<void> {
  const blocks = signatureBlocks(
    { title: clip.text, byline, ...(clip.subtitle === undefined ? {} : { subtext: clip.subtitle }) },
    ctx.format,
  );
  const placed: PlacedText[] = [];
  for (const block of blocks) {
    placed.push({ file: await textFile(ctx, `sign-${pad(i)}-${block.key}`, block.text), size: block.size, color: block.color, y: block.y });
  }
  const { width, height, fps } = ctx.format;
  await ffmpeg([
    '-f',
    'lavfi',
    '-i',
    `color=c=${TITLE_BACKGROUND}:s=${width}x${height}:r=${fps}:d=${clip.durationS}`,
    '-vf',
    signatureChain(placed, ctx.style, clip.durationS, clip.fadeS ?? 0),
    '-t',
    String(clip.durationS),
    ...encoderArgs(ctx.encoder, fps),
    out,
  ]);
}

async function renderTitle(ctx: RenderContext, i: number, clip: Extract<Clip, { kind: 'title' }>, out: string): Promise<void> {
  if (clip.byline !== undefined) {
    await renderSignature(ctx, i, clip, clip.byline, out);
    return;
  }
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

/**
 * Bande pleine puis cadre de mise en évidence puis sous-titre. La bande passe **sous** le cadre :
 * sur l'écran plein format, le cadre bleu d'une tuile de la rangée du bas descend jusque dans le
 * bandeau, et on doit continuer à voir son arête inférieure.
 */
async function overlayChain(ctx: RenderContext, i: number, clip: Extract<Clip, { kind: 'video' | 'freeze' }>): Promise<string[]> {
  const frame = clip.highlight === undefined ? [] : [highlightFilter(clip.highlight, ctx.style)];
  const caption = clip.caption;
  if (caption === undefined) return frame;
  const full = clip.captionFullWidth === true;
  const style: TextStyle = {
    ...ctx.style,
    ...(clip.captionWidth === undefined ? {} : { captionWidth: clip.captionWidth }),
    ...(clip.captionBottom === undefined ? {} : { captionBottom: clip.captionBottom }),
    // La bande pleine remplace la boîte qui épouse le texte : sans quoi les deux fonds se cumulent
    // et le sous-titre apparaît dans un rectangle plus sombre au milieu du bandeau.
    ...(full ? { bandOpacity: 0 } : {}),
  };
  const wrapped = wrapText(caption, captionWrapChars(style, style.captionWidth));
  const lines = lineCount(wrapped);
  if (lines > CAPTION_MAX_LINES) ctx.warn(`sous-titre sur ${lines} lignes, raccourcir : « ${caption} »`);
  const path = await textFile(ctx, `cap-${pad(i)}`, wrapped);
  const backdrop = full ? [captionBackdropFilter(captionBandRect(style, lines, ctx.format), CAPTION_BACKDROP_OPACITY)] : [];
  return [...backdrop, ...frame, ...captionFilters(path, style, lines, clipDurationS(clip))];
}

/**
 * Incrustation du terminal pour ce sous-plan : le fichier et l'instant correspondant, ou `null`
 * quand la prise n'a pas de capture de terminal ou que celle-ci n'avait pas encore commencé.
 */
function pipSource(ctx: RenderContext, clip: Extract<Clip, { kind: 'video' | 'freeze' }>): { path: string; atS: number } | null {
  if (clip.pip === undefined) return null;
  const track = ctx.terminalOf.get(clip.take);
  if (track === undefined) {
    ctx.warn(`prise « ${clip.take} » sans capture de terminal : incrustation ignorée`);
    return null;
  }
  const atS = terminalOffsetS(clip.kind === 'video' ? clip.fromS : clip.atS, track.startMs);
  if (atS === null) {
    ctx.warn(`prise « ${clip.take} » : terminal pas encore lancé à cet instant, incrustation ignorée`);
    return null;
  }
  return { path: track.path, atS };
}

/**
 * Le graphe d'un écran partagé : une seule entrée, dédoublée, deux recadrages, un assemblage. Le
 * titre de la bande du haut passe par un fichier UTF-8 comme tous les textes gravés.
 */
async function splitGraph(ctx: RenderContext, i: number, split: SplitSpec, overlays: readonly string[]): Promise<string> {
  const layout = splitLayout(split, ctx.format);
  const titlePath = await textFile(ctx, `split-${pad(i)}`, split.title);
  return splitComplex(layout, ctx.style, ctx.format, TITLE_BACKGROUND, titlePath, overlays);
}

async function renderVideo(ctx: RenderContext, i: number, clip: Extract<Clip, { kind: 'video' }>, out: string): Promise<void> {
  const overlays = await overlayChain(ctx, i, clip);
  const durationS = (clip.toS - clip.fromS).toFixed(3);
  if (clip.split !== undefined) {
    await ffmpeg([
      '-ss', clip.fromS.toFixed(3), '-i', sourceOf(ctx, clip.take),
      '-t', durationS,
      '-filter_complex', await splitGraph(ctx, i, clip.split, overlays),
      '-map', '[out]',
      ...encoderArgs(ctx.encoder, ctx.format.fps),
      out,
    ]);
    return;
  }
  const pip = pipSource(ctx, clip);
  if (pip !== null && clip.pip !== undefined) {
    await ffmpeg([
      '-ss', clip.fromS.toFixed(3), '-i', sourceOf(ctx, clip.take),
      '-ss', pip.atS.toFixed(3), '-i', pip.path,
      '-t', durationS,
      '-filter_complex', pipComplex(ctx.format, clip.pip, ctx.style, overlays),
      '-map', '[out]',
      ...encoderArgs(ctx.encoder, ctx.format.fps),
      out,
    ]);
    return;
  }
  await ffmpeg([
    '-ss',
    clip.fromS.toFixed(3),
    '-i',
    sourceOf(ctx, clip.take),
    '-t',
    durationS,
    '-vf',
    chain([...normalizeFilters(ctx.format), ...overlays]),
    ...encoderArgs(ctx.encoder, ctx.format.fps),
    out,
  ]);
}

/**
 * Les quatre textes d'un agrandissement : le titre de l'étape, puis ce qui entre, qui fait le
 * travail, ce qui sort. « Done by » porte la couleur des cadres : c'est la ligne qui répond à la
 * question que le propriétaire pose devant chaque tuile, « qui a fait ça, le modèle ou la sim ? ».
 */
const ZOOM_HEADING = { size: 36, color: 'white' } as const;
const ZOOM_ELEMENT = { size: 32, color: 'white' } as const;
const ZOOM_BY = { size: 32, color: '0x7DD3FC' } as const;

async function zoomBlocks(ctx: RenderContext, i: number, caption: string, zoom: ZoomSpec, textWidth: number): Promise<ZoomBlock[]> {
  const styles = [ZOOM_ELEMENT, ZOOM_BY, ZOOM_ELEMENT];
  const texts = [{ text: caption, ...ZOOM_HEADING }, ...zoomLines(zoom).map((text, k) => ({ text, ...(styles[k] ?? ZOOM_ELEMENT) }))];
  const blocks: ZoomBlock[] = [];
  for (const [k, t] of texts.entries()) {
    const wrapped = wrapText(t.text, zoomWrapChars(textWidth, t.size));
    const file = await textFile(ctx, `zoom-${pad(i)}-${k}`, wrapped);
    blocks.push({ file, lines: lineCount(wrapped), size: t.size, color: t.color });
  }
  return blocks;
}

/** Arrêt sur image agrandi : la tuile remplit le cadre, les trois éléments s'écrivent à côté. */
async function renderZoom(ctx: RenderContext, i: number, clip: Extract<Clip, { kind: 'freeze' }>, zoom: ZoomSpec, still: string, out: string): Promise<void> {
  const layout = zoomLayout(zoom.source, ctx.format);
  const blocks = await zoomBlocks(ctx, i, clip.caption, zoom, layout.textWidth);
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
    zoomChain(layout, blocks, ctx.style, ctx.format, TITLE_BACKGROUND, clip.durationS),
    ...encoderArgs(ctx.encoder, ctx.format.fps),
    out,
  ]);
}

async function renderFreeze(ctx: RenderContext, i: number, clip: Extract<Clip, { kind: 'freeze' }>, out: string): Promise<void> {
  const still = join(ctx.workDir, `still-${pad(i)}.png`);
  await ffmpeg(['-ss', clip.atS.toFixed(3), '-i', sourceOf(ctx, clip.take), '-frames:v', '1', still]);
  if (clip.zoom !== undefined) {
    await renderZoom(ctx, i, clip, clip.zoom, still, out);
    return;
  }
  if (clip.split !== undefined) {
    // L'arrêt sur image garde exactement la mise en page de la lecture : seule l'image se fige.
    await ffmpeg([
      '-loop', '1', '-framerate', String(ctx.format.fps), '-t', String(clip.durationS), '-i', still,
      '-t', String(clip.durationS),
      '-filter_complex', await splitGraph(ctx, i, clip.split, await overlayChain(ctx, i, clip)),
      '-map', '[out]',
      ...encoderArgs(ctx.encoder, ctx.format.fps),
      out,
    ]);
    return;
  }
  const pip = pipSource(ctx, clip);
  if (pip !== null && clip.pip !== undefined) {
    const pipStill = join(ctx.workDir, `term-${pad(i)}.png`);
    await ffmpeg(['-ss', pip.atS.toFixed(3), '-i', pip.path, '-frames:v', '1', pipStill]);
    await ffmpeg([
      '-loop', '1', '-framerate', String(ctx.format.fps), '-t', String(clip.durationS), '-i', still,
      '-loop', '1', '-framerate', String(ctx.format.fps), '-t', String(clip.durationS), '-i', pipStill,
      '-t', String(clip.durationS),
      '-filter_complex', pipComplex(ctx.format, clip.pip, ctx.style, await overlayChain(ctx, i, clip)),
      '-map', '[out]',
      ...encoderArgs(ctx.encoder, ctx.format.fps),
      out,
    ]);
    return;
  }
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

export { concatClips, extractFrames, prepareWorkDir } from './renderOutput';

export { clipDurationS, escapeFilterPath };
