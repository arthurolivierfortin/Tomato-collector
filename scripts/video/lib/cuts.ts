/**
 * Découpes : un segment résolu devient une suite de sous-plans que ffmpeg sait produire un par un,
 * puis concaténer. Un arrêt sur image coupe le segment en deux et s'intercale entre les morceaux.
 * Pur et testé sans ffmpeg.
 */
import type { ResolvedEntry, ResolvedSegment } from './plan';

export type Clip =
  | { readonly kind: 'title'; readonly text: string; readonly durationS: number; readonly subtitle?: string }
  | { readonly kind: 'video'; readonly take: string; readonly fromS: number; readonly toS: number; readonly caption?: string; readonly atTop?: boolean }
  | { readonly kind: 'freeze'; readonly take: string; readonly atS: number; readonly durationS: number; readonly caption: string; readonly atTop: boolean };

/** Sous-plan vidéo plus court qu'une image à 30 fps : ffmpeg en ferait un fichier vide. */
const MIN_CLIP_S = 0.04;

export function segmentClips(segment: ResolvedSegment): Clip[] {
  const clips: Clip[] = [];
  if (segment.title !== undefined) clips.push(titleClip(segment.title));
  const caption = segment.caption === undefined ? {} : { caption: segment.caption, atTop: segment.atTop };
  let cursor = segment.fromS;
  for (const freeze of segment.freezes) {
    if (freeze.atS - cursor >= MIN_CLIP_S) {
      clips.push({ kind: 'video', take: segment.take, fromS: cursor, toS: freeze.atS, ...caption });
    }
    clips.push({ kind: 'freeze', take: segment.take, atS: freeze.atS, durationS: freeze.durationS, caption: freeze.caption, atTop: freeze.atTop });
    cursor = freeze.atS;
  }
  if (segment.toS - cursor >= MIN_CLIP_S) {
    clips.push({ kind: 'video', take: segment.take, fromS: cursor, toS: segment.toS, ...caption });
  }
  return clips;
}

function titleClip(title: { text: string; durationS: number; subtitle?: string }): Clip {
  const { text, durationS, subtitle } = title;
  return { kind: 'title', text, durationS, ...(subtitle === undefined ? {} : { subtitle }) };
}

/** Une entrée de plan : un carton seul, ou un segment découpé par ses arrêts sur image. */
export function entryClips(entry: ResolvedEntry): Clip[] {
  return 'card' in entry ? [titleClip(entry.card)] : segmentClips(entry);
}

export function clipDurationS(clip: Clip): number {
  return clip.kind === 'video' ? clip.toS - clip.fromS : clip.durationS;
}

export function totalDurationS(clips: readonly Clip[]): number {
  return clips.reduce((sum, clip) => sum + clipDurationS(clip), 0);
}

export function formatDurationS(seconds: number): string {
  const total = Math.round(seconds);
  return `${Math.floor(total / 60)} min ${String(total % 60).padStart(2, '0')} s`;
}
