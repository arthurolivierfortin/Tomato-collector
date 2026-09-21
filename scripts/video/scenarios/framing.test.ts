/**
 * Cadrage de la vue spectateur pendant les deux prises en direct (issue #42).
 *
 * Deux touches entrent en jeu et une seule est pressée : `k` bascule le cadrage large ↔ coupe, et
 * c'est le scénario qui décide quand ; `j` force l'incrustation de la caméra outil, et justement le
 * scénario n'y touche pas — elle s'allume et s'éteint toute seule. Un `j` de trop l'éteindrait
 * pendant la coupe, ce que personne ne verrait avant le montage.
 */
import { describe, expect, it } from 'vitest';
import type { Scenario, ScenarioStep } from '../lib/scenario';
import { conceptsScenario } from './concepts';
import { cycleScenario } from './cycle';

interface Case {
  readonly scenario: Scenario;
  /** Marqueur du positionnement fin : la dernière chose que l'agent fait avant de couper. */
  readonly positioning: string;
  /** Marqueur de la chute dans le panier. */
  readonly landed: string;
  readonly end: string;
}

const CASES: readonly Case[] = [
  { scenario: conceptsScenario('live'), positioning: 'rotate', landed: 'landed', end: 'end' },
  { scenario: cycleScenario('live'), positioning: 'positionnement', landed: 'chute', end: 'fin' },
];

function markerIndex(steps: readonly ScenarioStep[], name: string): number {
  const i = steps.findIndex((s) => s.kind === 'marker' && s.name === name);
  if (i < 0) throw new Error(`marqueur « ${name} » absent du scénario`);
  return i;
}

function pressIndexes(steps: readonly ScenarioStep[], key: string): number[] {
  return steps.flatMap((s, i) => (s.kind === 'press' && s.key === key ? [i] : []));
}

/** Temps d'attente après la chute avant de revenir au cadrage large : celui de l'incrustation. */
const LINGER_MS = 2000;

describe.each(CASES)('cadrage de la prise « $scenario.name »', ({ scenario, positioning, landed, end }) => {
  const steps = scenario.steps;

  it('masque les contrôles avant de toucher au cadrage', () => {
    // Le panneau des contrôles occupe le bas de la colonne spectateur et recouvre l'incrustation
    // de la caméra outil (README, touche `j`). Il doit être replié avant, pas après.
    const [hidden] = pressIndexes(steps, 'h');
    expect(hidden).toBe(0);
    for (const k of pressIndexes(steps, 'k')) expect(k).toBeGreaterThan(hidden ?? 0);
  });

  it('passe au cadrage coupe dès le positionnement fin, et n’y touche qu’une fois', () => {
    const presses = pressIndexes(steps, 'k');
    expect(presses).toHaveLength(2);
    expect(presses[0]).toBe(markerIndex(steps, positioning) + 1);
  });

  it('revient au cadrage large deux secondes après la chute, avant la fin de la prise', () => {
    const [, back] = pressIndexes(steps, 'k');
    expect(back).toBe(markerIndex(steps, landed) + 2);
    expect(steps[(back ?? 0) - 1]).toEqual({ kind: 'wait', ms: LINGER_MS });
    expect(back).toBeLessThan(markerIndex(steps, end));
  });

  it('laisse l’incrustation de la caméra outil à sa règle automatique', () => {
    expect(pressIndexes(steps, 'j')).toEqual([]);
  });
});
