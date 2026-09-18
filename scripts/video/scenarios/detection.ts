/**
 * Prise « detection » : ce que le modèle voit **avant**, **pendant** et **après** le mûrissement.
 *
 * Le reste du film montre la détection comme un événement : un bandeau s'allume, l'agent se réveille.
 * Cette prise-là montre la décision elle-même. Le panneau « Perception » (touche `p`) est ouvert du
 * début à la fin, et on suit, dans l'ordre :
 *
 * 1. tomate verte : le détecteur ne rend que des boîtes `unripe`, aucune `ripe` ;
 * 2. la tomate rougit, la rampe de maturité monte dans le bandeau de statuts ;
 * 3. la première boîte `ripe` apparaît, avec sa confiance ;
 * 4. la porte de réveil monte, 1/5 puis 3/5 puis 5/5 frames consécutives ;
 * 5. le serveur réveille l'agent.
 *
 * **Gratuite.** Elle se filme avec `TOMATO_AGENT=off` : la détection ouvre alors un épisode mis en
 * scène, sans appeler le SDK. Tout ce que la prise montre — les boîtes, les scores, la porte, le
 * réveil — vient du vrai détecteur et du vrai serveur ; seule la session de l'agent n'existe pas,
 * et la prise s'arrête avant elle.
 */
import type { TakeMode } from '../lib/markers';
import type { Scenario, ScenarioStep } from '../lib/scenario';

/** Panneau « Perception » (issue #36, touche `p`) et ses deux lignes qui portent la décision. */
const PERCEPTION_PANEL = '[data-testid="perception-panel"]';
const PERCEPTION_BOXES = '[data-testid="perception-boxes"]';
const PERCEPTION_GATE = '[data-testid="perception-gate"]';
/** La flèche allumée du schéma bloc ; chaque activité y reste au moins 1,2 s (`blockQueue`). */
const BLOCK_FLOW = '[data-testid="block-flow"]';

/** Le mûrissement est local à la page : 15 s de temps simulé, mais la page peut être occupée. */
const RIPENING_TIMEOUT_MS = 180_000;
/** La détection prend 2,5 à 6 s après la maturité (docs/perception-model.md) : large de côté. */
const DETECT_TIMEOUT_MS = 60_000;

export function detectionScenario(mode: TakeMode): Scenario {
  const steps: ScenarioStep[] = [
    // Contrôles masqués dès la première image, puis le panneau « Perception » ouvert tout de suite :
    // c'est lui le sujet, il doit être à l'écran avant que la tomate commence à rougir.
    { kind: 'press', key: 'h' },
    { kind: 'gate', name: 'perception', key: 'p', selector: PERCEPTION_PANEL },
    { kind: 'marker', name: 'start' },
    // De quoi voir le détecteur tourner sur une tomate encore verte : que des boîtes `unripe`.
    { kind: 'wait', ms: 3500 },
  ];
  if (mode === 'replay') steps.push({ kind: 'replay', speed: 1 });
  steps.push(
    { kind: 'waitForRipeness', minPercent: 20, timeoutMs: RIPENING_TIMEOUT_MS },
    { kind: 'marker', name: 'ripening_20' },
    { kind: 'waitForRipeness', minPercent: 60, timeoutMs: RIPENING_TIMEOUT_MS },
    { kind: 'marker', name: 'ripening_60' },
    // La première boîte `ripe` : « 0 ripe · 8 unripe » devient « 1 ripe · 7 unripe ».
    { kind: 'waitForText', selector: PERCEPTION_BOXES, text: '1 ripe', timeoutMs: RIPENING_TIMEOUT_MS },
    { kind: 'marker', name: 'first_ripe_box' },
    // La porte de réveil : cinq frames consécutives avant que le serveur soit prévenu.
    { kind: 'waitForText', selector: PERCEPTION_GATE, text: '3/5', timeoutMs: DETECT_TIMEOUT_MS },
    { kind: 'marker', name: 'gate_3' },
    { kind: 'waitForText', selector: PERCEPTION_GATE, text: '5/5', timeoutMs: DETECT_TIMEOUT_MS },
    { kind: 'marker', name: 'gate_5' },
    // Le réveil, mis en scène par le serveur puisque l'agent est coupé : la flèche s'allume quand même.
    { kind: 'waitForText', selector: BLOCK_FLOW, text: 'réveil', timeoutMs: DETECT_TIMEOUT_MS },
    { kind: 'marker', name: 'wake' },
    { kind: 'wait', ms: 3000 },
    { kind: 'marker', name: 'end' },
    { kind: 'wait', ms: 1000 },
  );
  return { name: 'detection', mode, steps };
}
