/**
 * Plan de montage : une liste de segments qui citent une prise et des instants. Les instants
 * peuvent être des secondes ou des marqueurs posés pendant l'enregistrement — c'est ce qui permet
 * de refaire une prise sans réécrire le plan. Tout est pur et testé sans ffmpeg.
 */
import type { PipSpec, Rect } from './ffmpegFilters';
import { markerS, type TakeMarkers } from './markers';
import type { ZoomSpec } from './zoom';

/** Un instant du plan : des secondes, un marqueur (avec décalage), ou la fin de la prise. */
export type TimeRef = number | 'end' | { readonly marker: string; readonly offsetS?: number };

export interface FreezeSpec {
  readonly at: TimeRef;
  readonly durationS: number;
  readonly caption: string;
  /** Zone de l'image à entourer d'un cadre, en pixels (schéma bloc, trace, vue mise en avant). */
  readonly highlight?: Rect;
  /** Largeur du bandeau de sous-titre, quand la mise en page rétrécit la colonne spectateur. */
  readonly captionWidth?: number;
  /** Hauteur du bandeau au-dessus du bas de l'image ; hérite de celle du segment quand absente. */
  readonly captionBottom?: number;
  /** Bandeau pleine largeur ; hérite de celui du segment quand il est absent. */
  readonly captionFullWidth?: boolean;
  /** Zone où incruster la capture du terminal ; hérite de celle du segment quand elle est absente. */
  readonly pip?: PipSpec;
  /**
   * Agrandit une zone de l'image au lieu de montrer l'écran entier : le sous-titre du segment
   * devient le titre de l'agrandissement, et les trois éléments (entrée, qui fait le travail,
   * sortie) sont écrits à côté de la zone agrandie.
   */
  readonly zoom?: ZoomSpec;
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
  /** Cadre gardé pendant tout le segment ; un arrêt sur image peut le remplacer par le sien. */
  readonly highlight?: Rect;
  /** Largeur du bandeau de sous-titre pour ce segment (défaut : celle du style). */
  readonly captionWidth?: number;
  /**
   * Distance entre le bas de l'image et le bas du bandeau, pour ce segment (défaut : celle du
   * style, 145 px, calée sur le dashboard). Un écran plein format n'a pas la même géographie que le
   * dashboard : le mode « Pipeline de traitement » occupe toute l'image, et son bandeau descend
   * donc sur la dernière ligne de texte des tuiles du bas, la seule bande redondante de cet écran.
   */
  readonly captionBottom?: number;
  /**
   * Pose le sous-titre sur une bande pleine largeur au lieu d'une boîte qui épouse le texte. Sur un
   * écran plein format, la boîte laissait dépasser, à sa droite, un fragment de la rangée de
   * légendes de l'application.
   */
  readonly captionFullWidth?: boolean;
  /**
   * Incruste la capture du terminal de la prise dans cette zone (issue #35). Sans capture de
   * terminal, le segment est monté tel quel : le montage prévient, il n'échoue pas.
   */
  readonly pip?: PipSpec;
  /**
   * Segment facultatif : s'il cite un marqueur que la prise n'a pas posé, il est retiré du plan
   * au lieu de faire échouer le montage. Réservé aux panneaux qu'une autre branche livre.
   */
  readonly optional?: boolean;
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
  readonly highlight?: Rect;
  readonly captionWidth?: number;
  readonly captionBottom?: number;
  readonly captionFullWidth?: boolean;
  readonly pip?: PipSpec;
  readonly zoom?: ZoomSpec;
}

export interface ResolvedSegment {
  readonly take: string;
  readonly video: string;
  readonly fromS: number;
  readonly toS: number;
  readonly title?: TitleSpec;
  readonly caption?: string;
  readonly highlight?: Rect;
  readonly captionWidth?: number;
  readonly captionBottom?: number;
  readonly captionFullWidth?: boolean;
  readonly pip?: PipSpec;
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
    .map((f) => {
      const zone = f.highlight ?? spec.highlight;
      const width = f.captionWidth ?? spec.captionWidth;
      const bottom = f.captionBottom ?? spec.captionBottom;
      const full = f.captionFullWidth ?? spec.captionFullWidth;
      const pip = f.pip ?? spec.pip;
      return {
        atS: resolveTime(f.at, take),
        durationS: f.durationS,
        caption: f.caption,
        ...(zone === undefined ? {} : { highlight: zone }),
        ...(width === undefined ? {} : { captionWidth: width }),
        ...(bottom === undefined ? {} : { captionBottom: bottom }),
        ...(full === undefined ? {} : { captionFullWidth: full }),
        ...(pip === undefined ? {} : { pip }),
        ...(f.zoom === undefined ? {} : { zoom: f.zoom }),
      };
    })
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
    ...(spec.highlight === undefined ? {} : { highlight: spec.highlight }),
    ...(spec.captionWidth === undefined ? {} : { captionWidth: spec.captionWidth }),
    ...(spec.captionBottom === undefined ? {} : { captionBottom: spec.captionBottom }),
    ...(spec.captionFullWidth === undefined ? {} : { captionFullWidth: spec.captionFullWidth }),
    ...(spec.pip === undefined ? {} : { pip: spec.pip }),
    ...(spec.title === undefined ? {} : { title: spec.title }),
    ...(spec.caption === undefined ? {} : { caption: spec.caption }),
  };
}

/**
 * Résout chaque entrée contre les marqueurs des prises. Un segment `optional` dont un marqueur
 * manque est retiré du plan, avec un avertissement : c'est le cas d'un panneau qu'une autre branche
 * n'a pas encore livré, pas une erreur de plan.
 */
export function resolvePlan(
  plan: MontagePlan,
  takes: ReadonlyMap<string, TakeMarkers>,
  warn: (line: string) => void = () => undefined,
): ResolvedEntry[] {
  const out: ResolvedEntry[] = [];
  for (const entry of plan.segments) {
    if (isCard(entry)) {
      out.push(entry);
      continue;
    }
    const take = takes.get(entry.take);
    if (take === undefined) {
      throw new Error(`plan : prise « ${entry.take} » absente (prises chargées : ${[...takes.keys()].join(', ') || 'aucune'})`);
    }
    try {
      out.push(resolveSegment(entry, take));
    } catch (e) {
      if (entry.optional !== true) throw e;
      warn(`segment facultatif retiré : ${e instanceof Error ? e.message : String(e)}`);
    }
  }
  return out;
}

export { isMontagePlan } from './planGuard';
export { zoomLines, type ZoomSpec } from './zoom';
