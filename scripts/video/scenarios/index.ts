import type { TakeMode } from '../lib/markers';
import type { Scenario } from '../lib/scenario';
import { conceptsScenario } from './concepts';
import { cycleScenario } from './cycle';

export const SCENARIO_NAMES = ['concepts', 'cycle'] as const;

/** Scénario intégré ; `mode` vient de la ligne de commande et gagne sur le mode par défaut. */
export function builtinScenario(name: string, mode: TakeMode): Scenario {
  if (name === 'concepts') return { ...conceptsScenario, mode };
  if (name === 'cycle') return cycleScenario(mode);
  throw new Error(`scénario inconnu : ${name} (connus : ${SCENARIO_NAMES.join(', ')})`);
}
