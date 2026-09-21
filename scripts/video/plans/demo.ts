/**
 * Plan de montage de la vidéo de démo, la traduction en données de `scripts/video/storyboard.md`.
 *
 * Les instants sont des marqueurs posés à l'enregistrement : refaire une prise ne demande pas de
 * retoucher le plan. **Tous les textes gravés dans l'image sont en anglais** (cartons, sous-titres,
 * cartons de fin) ; les libellés du dashboard, eux, restent ceux de l'application.
 *
 * Aucun décalage ne remonte avant le marqueur précédent : les marqueurs sont posés dans l'ordre du
 * scénario, donc un segment qui va d'un marqueur au suivant ne peut ni s'inverser ni empiéter sur
 * le segment d'avant. C'est la règle qui garde le plan robuste quand un épisode est plus rapide ou
 * plus lent que celui sur lequel il a été réglé.
 *
 * Le découpage lui-même est dans `part1.ts` et `part2.ts`, la géographie de l'écran dans `zones.ts`.
 */
import type { EndCardData } from '../lib/episodes';
import { zoomLines, type CardSpec, type MontagePlan, type PlanEntry, type SplitSpec, type TitleSpec } from '../lib/plan';
import { part1 } from './part1';
import { part2 } from './part2';

/** Le nom du projet, tel qu'il s'affiche à l'ouverture et à la fin. */
export const PROJECT = 'Tomato Collector';

/**
 * Le nom du propriétaire, écrit **tel qu'il s'écrit** : un trait d'union court (U+002D) entre les
 * deux prénoms. La règle « aucun tiret cadratin ni demi-cadratin » vaut pour la ponctuation des
 * textes gravés, pas pour un nom propre, qui ne se retouche pas.
 */
export const AUTHOR = 'Arthur-Olivier Fortin';

/** La ligne d'auteur des deux cartons de signature. */
export const BYLINE = `By ${AUTHOR}`;

/** Fondu au noir des cartons de signature : assez long pour se voir, assez court pour ne pas peser. */
const SIGNATURE_FADE_S = 0.6;

/**
 * Carton d'ouverture : le titre en grand, la signature dessous, et une phrase qui dit en un souffle
 * ce que le film montre. Il précède tout le reste, cartons de section compris.
 */
export function openingCard(): CardSpec {
  return {
    card: {
      text: PROJECT,
      durationS: 4,
      byline: BYLINE,
      subtitle: 'A Claude agent harvests tomatoes in a 3D simulation',
      fadeS: SIGNATURE_FADE_S,
    },
  };
}

/**
 * Carton de fin : la même signature, seule, en fondu au noir. Il vient après les cartons de fin
 * tirés du journal, donc après le carton des résultats : c'est la dernière image du film.
 */
export function signOffCard(): CardSpec {
  return { card: { text: PROJECT, durationS: 4, byline: BYLINE, fadeS: SIGNATURE_FADE_S } };
}

function endCards(end: EndCardData): PlanEntry[] {
  // Le coût n'apparaît que si le journal en porte un : mieux vaut ne rien dire que dire faux.
  const facts = [`${end.toolCalls} tool calls`, `${Math.round(end.durationS)} s`, ...(end.cost === null ? [] : [end.cost])];
  return [
    { card: { text: `Result: ${end.outcome}`, durationS: 4.5, subtitle: facts.join(' · ') } },
    {
      card: {
        text: 'An LLM can drive a robot',
        durationS: 5.5,
        subtitle: 'given tools it can call and images it can read like text',
      },
    },
  ];
}

export function demoPlan(end: EndCardData): MontagePlan {
  return {
    output: 'tomato-demo.mp4',
    width: 1920,
    height: 1080,
    fps: 30,
    segments: [openingCard(), ...part1, ...part2, ...endCards(end), signOffCard()],
  };
}

/** Les trois textes possibles d'un carton : titre, ligne d'auteur, sous-texte. */
function titleTexts(title: TitleSpec): string[] {
  return [title.text, ...(title.byline === undefined ? [] : [title.byline]), ...(title.subtitle === undefined ? [] : [title.subtitle])];
}

/** Tous les textes que le montage grave dans l'image : cartons, sous-titres, arrêts sur image. */
export function burnedTexts(plan: MontagePlan): string[] {
  const out: string[] = [];
  for (const entry of plan.segments) {
    if ('card' in entry) {
      out.push(...titleTexts(entry.card));
      continue;
    }
    if (entry.title !== undefined) out.push(...titleTexts(entry.title));
    if (entry.caption !== undefined) out.push(entry.caption);
    // Le titre de la bande du haut d'un écran partagé est gravé lui aussi : même relecture.
    if (entry.split !== undefined) out.push(entry.split.title);
    for (const f of entry.freezeAt ?? []) {
      out.push(f.caption);
      if (f.split !== undefined) out.push(f.split.title);
      // Les trois éléments d'un agrandissement sont gravés eux aussi : ils passent donc la même
      // relecture que le reste (anglais, aucun tiret long).
      if (f.zoom !== undefined) out.push(...zoomLines(f.zoom));
    }
  }
  return out;
}

/** Toutes les zones d'incrustation que le plan emploie : le test de géométrie les parcourt. */
export function planPips(plan: MontagePlan): PlanEntry[] {
  return plan.segments.filter((e) => !('card' in e) && e.pip !== undefined);
}

/** Tous les écrans partagés du plan, segment par segment : le test de géométrie les parcourt. */
export function planSplits(plan: MontagePlan): SplitSpec[] {
  return plan.segments.flatMap((e) => ('card' in e || e.split === undefined ? [] : [e.split]));
}
