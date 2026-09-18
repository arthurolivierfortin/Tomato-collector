/**
 * Plan de montage : une liste de segments qui citent une prise et des instants. Les instants
 * peuvent être des secondes ou des marqueurs posés pendant l'enregistrement — c'est ce qui permet
 * de refaire une prise sans réécrire le plan. Tout est pur et testé sans ffmpeg.
 */
import { markerS, type TakeMarkers } from './markers';

/** Un instant du plan : des secondes, un marqueur (avec décalage), ou la fin de la prise. */
export type TimeRef = number | 'end' | { readonly marker: string; readonly offsetS?: number };

export interface FreezeSpec {
  readonly at: TimeRef;
  readonly durationS: number;
  readonly caption: string;
  /** Bandeau en haut plutôt qu'en bas : sur le schéma bloc, le bas de l'image porte l'information. */
  readonly atTop?: boolean;
}

export interface TitleSpec {
  readonly text: string;
  readonly durationS: number;
  readonly subtitle?: string;
}

export interface SegmentSpec {
  readonly take: string;
  readonly from: TimeRef;
  readonly to: TimeRef;
  /** Carton de titre joué juste avant le segment. */
  readonly title?: TitleSpec;
  /** Sous-titre affiché en bandeau pendant tout le segment. */
  readonly caption?: string;
  /** Bandeau en haut pour tout le segment. */
  readonly atTop?: boolean;
  readonly freezeAt?: readonly FreezeSpec[];
}

/** Carton de titre seul, sans image : ouverture, transition, cartons de fin. */
export interface CardSpec {
  readonly card: TitleSpec;
}

export type PlanEntry = SegmentSpec | CardSpec;

export interface MontagePlan {
  readonly output: string;
  readonly width: number;
  readonly height: number;
  readonly fps: number;
  readonly segments: readonly PlanEntry[];
}

export type ResolvedEntry = ResolvedSegment | { readonly card: TitleSpec };

function isCard(entry: PlanEntry): entry is CardSpec {
  return 'card' in entry;
}

export interface ResolvedFreeze {
  readonly atS: number;
  readonly durationS: number;
  readonly caption: string;
  readonly atTop: boolean;
}

export interface ResolvedSegment {
  readonly take: string;
  readonly video: string;
  readonly fromS: number;
  readonly toS: number;
  readonly title?: TitleSpec;
  readonly caption?: string;
  readonly atTop: boolean;
  readonly freezes: readonly ResolvedFreeze[];
}

export function resolveTime(ref: TimeRef, take: TakeMarkers): number {
  if (ref === 'end') return take.durationMs / 1000;
  if (typeof ref === 'number') return Math.max(0, ref);
  return Math.max(0, markerS(take, ref.marker) + (ref.offsetS ?? 0));
}

function resolveSegment(spec: SegmentSpec, take: TakeMarkers): ResolvedSegment {
  const fromS = resolveTime(spec.from, take);
  const toS = resolveTime(spec.to, take);
  if (toS <= fromS) {
    throw new Error(`prise « ${spec.take} » : segment vide ou à l’envers (${fromS.toFixed(2)} s → ${toS.toFixed(2)} s)`);
  }
  const freezes = [...(spec.freezeAt ?? [])]
    .map((f) => ({ atS: resolveTime(f.at, take), durationS: f.durationS, caption: f.caption, atTop: f.atTop ?? spec.atTop ?? false }))
    .sort((a, b) => a.atS - b.atS);
  for (const f of freezes) {
    if (f.atS < fromS || f.atS > toS) {
      throw new Error(`prise « ${spec.take} » : arrêt sur image « ${f.caption} » à ${f.atS.toFixed(2)} s, hors du segment ${fromS.toFixed(2)}–${toS.toFixed(2)} s`);
    }
  }
  return {
    take: spec.take,
    video: take.video,
    fromS,
    toS,
    freezes,
    atTop: spec.atTop ?? false,
    ...(spec.title === undefined ? {} : { title: spec.title }),
    ...(spec.caption === undefined ? {} : { caption: spec.caption }),
  };
}

export function resolvePlan(plan: MontagePlan, takes: ReadonlyMap<string, TakeMarkers>): ResolvedEntry[] {
  return plan.segments.map((entry) => {
    if (isCard(entry)) return entry;
    const spec = entry;
    const take = takes.get(spec.take);
    if (take === undefined) {
      throw new Error(`plan : prise « ${spec.take} » absente (prises chargées : ${[...takes.keys()].join(', ') || 'aucune'})`);
    }
    return resolveSegment(spec, take);
  });
}
