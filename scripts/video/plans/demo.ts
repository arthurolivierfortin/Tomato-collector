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
import { zoomLines, type MontagePlan, type PlanEntry } from '../lib/plan';
import { part1 } from './part1';
import { part2 } from './part2';

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
  return { output: 'tomato-demo.mp4', width: 1920, height: 1080, fps: 30, segments: [...part1, ...part2, ...endCards(end)] };
}

/** Tous les textes que le montage grave dans l'image : cartons, sous-titres, arrêts sur image. */
export function burnedTexts(plan: MontagePlan): string[] {
  const out: string[] = [];
  for (const entry of plan.segments) {
    if ('card' in entry) {
      out.push(entry.card.text, ...(entry.card.subtitle === undefined ? [] : [entry.card.subtitle]));
      continue;
    }
    if (entry.title !== undefined) out.push(entry.title.text, ...(entry.title.subtitle === undefined ? [] : [entry.title.subtitle]));
    if (entry.caption !== undefined) out.push(entry.caption);
    for (const f of entry.freezeAt ?? []) {
      out.push(f.caption);
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
