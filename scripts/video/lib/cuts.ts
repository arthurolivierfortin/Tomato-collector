/**
 * Découpes : un segment résolu devient une suite de sous-plans que ffmpeg sait produire un par un,
 * puis concaténer. Un arrêt sur image coupe le segment en deux et s'intercale entre les morceaux.
 * Pur et testé sans ffmpeg.
 */
import type { Rect } from './ffmpegFilters';
import type { ResolvedEntry, ResolvedSegment } from './plan';

export type Clip =
  | { readonly kind: 'title'; readonly text: string; readonly durationS: number; readonly subtitle?: string }
  | {
      readonly kind: 'video';
      readonly take: string;
      readonly fromS: number;
      readonly toS: number;
      readonly caption?: string;
      readonly highlight?: Rect;
      readonly captionWidth?: number;
      readonly pip?: Rect;
    }
  | {
      readonly kind: 'freeze';
      readonly take: string;
      readonly atS: number;
      readonly durationS: number;
      readonly caption: string;
      readonly highlight?: Rect;
      readonly captionWidth?: number;
      readonly pip?: Rect;
    };

/** Sous-plan vidéo plus court qu'une image à 30 fps : ffmpeg en ferait un fichier vide. */
const MIN_CLIP_S = 0.04;

export function segmentClips(segment: ResolvedSegment): Clip[] {
  const clips: Clip[] = [];
  if (segment.title !== undefined) clips.push(titleClip(segment.title));
  const caption = {
    ...(segment.caption === undefined ? {} : { caption: segment.caption }),
    ...(segment.highlight === undefined ? {} : { highlight: segment.highlight }),
    ...(segment.captionWidth === undefined ? {} : { captionWidth: segment.captionWidth }),
    ...(segment.pip === undefined ? {} : { pip: segment.pip }),
  };
  let cursor = segment.fromS;
  for (const freeze of segment.freezes) {
    if (freeze.atS - cursor >= MIN_CLIP_S) {
      clips.push({ kind: 'video', take: segment.take, fromS: cursor, toS: freeze.atS, ...caption });
    }
    clips.push({
      kind: 'freeze',
      take: segment.take,
      atS: freeze.atS,
      durationS: freeze.durationS,
      caption: freeze.caption,
      ...(freeze.highlight === undefined ? {} : { highlight: freeze.highlight }),
      ...(freeze.captionWidth === undefined ? {} : { captionWidth: freeze.captionWidth }),
      ...(freeze.pip === undefined ? {} : { pip: freeze.pip }),
    });
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

function lowerFirst(text: string): string {
  return text.length === 0 ? text : text[0]!.toLowerCase() + text.slice(1);
}

/** Les sous-titres sont gravés dans la vidéo, qui est en anglais : la jointure l'est aussi. */
function joinCaptions(first: string | undefined, second: string | undefined): string | undefined {
  if (first === undefined) return second;
  if (second === undefined) return first;
  return `${first}, then ${lowerFirst(second)}`;
}

function merge(a: ResolvedSegment, b: ResolvedSegment): ResolvedSegment {
  const caption = joinCaptions(a.caption, b.caption);
  const title = a.title ?? b.title;
  const highlight = a.highlight ?? b.highlight;
  const pip = a.pip ?? b.pip;
  return {
    take: a.take,
    video: a.video,
    fromS: Math.min(a.fromS, b.fromS),
    toS: Math.max(a.toS, b.toS),
    freezes: [...a.freezes, ...b.freezes].sort((x, y) => x.atS - y.atS),
    ...(caption === undefined ? {} : { caption }),
    ...(title === undefined ? {} : { title }),
    ...(highlight === undefined ? {} : { highlight }),
    ...(pip === undefined ? {} : { pip }),
  };
}

function isSegment(entry: ResolvedEntry): entry is ResolvedSegment {
  return !('card' in entry);
}

/**
 * Un segment à fusionner : trop court pour que son sous-titre se lise, et *simple* — ni carton, ni
 * arrêt sur image. Un segment de la partie 1 dure souvent deux secondes avant un arrêt sur image de
 * trois : son sous-titre n'est pas le texte que le spectateur lit, il ne faut pas y toucher.
 */
function isMergeable(entry: ResolvedEntry, minS: number): entry is ResolvedSegment {
  return isSegment(entry) && entry.freezes.length === 0 && entry.title === undefined && entry.toS - entry.fromS < minS;
}

/**
 * Un sous-titre affiché moins de `minS` n'est pas lisible : le segment trop court est fusionné avec
 * le suivant de la même prise, et les deux légendes deviennent une phrase (« Cut, then the fall
 * into the basket »). Les durées réelles varient d'une prise à l'autre : c'est au montage de
 * s'adapter, pas au plan de deviner.
 */
export function mergeShortSegments(entries: readonly ResolvedEntry[], minS: number): ResolvedEntry[] {
  const out: ResolvedEntry[] = [];
  let pending: ResolvedSegment | null = null;
  for (const entry of entries) {
    let current: ResolvedEntry = entry;
    if (pending !== null) {
      if (isSegment(current) && current.take === pending.take) current = merge(pending, current);
      else out.push(pending);
      pending = null;
    }
    if (isMergeable(current, minS)) pending = current;
    else out.push(current);
  }
  if (pending === null) return out;
  // Dernier segment trop court : pas de suivant, il rejoint le précédent.
  const last = out[out.length - 1];
  if (last !== undefined && isSegment(last) && last.take === pending.take) out[out.length - 1] = merge(last, pending);
  else out.push(pending);
  return out;
}
