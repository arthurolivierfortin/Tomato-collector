/**
 * Partie 2 « Un cycle complet » : une prise de A à Z, sans coupure. En direct (`--mode live`) c'est
 * l'agent réel qui joue ; en replay c'est un journal de `data/episodes/` rejoué à ×1. Les marqueurs
 * sont les mêmes dans les deux cas : le plan de montage n'a pas à savoir lequel a servi.
 */
import type { TakeMode } from '../lib/markers';
import type { Scenario, ScenarioStep } from '../lib/scenario';

const TRACE = '[data-testid="trace"]';
/** Un épisode mené par Claude prend une minute, parfois plus : large de côté, jamais serré. */
const EPISODE_TIMEOUT_MS = 300_000;

/**
 * Le mûrissement est local à la page et démarre seul : depuis l'issue #23, la première tomate
 * lance sa rampe 3 s après le chargement du plant. Rien à déclencher, dans aucun des deux modes ;
 * en direct c'est lui qui provoquera la détection, en replay il donne au spectateur la même entrée
 * en matière pendant que le journal attend son tour.
 */
function opening(mode: TakeMode): ScenarioStep[] {
  const steps: ScenarioStep[] = [
    // Contrôles masqués dès le départ : cadrage propre, et le bas de la colonne spectateur reste
    // libre pour les sous-titres du montage.
    { kind: 'press', key: 'h' },
    { kind: 'marker', name: 'debut' },
    { kind: 'wait', ms: 2500 },
    { kind: 'marker', name: 'murissement' },
  ];
  if (mode === 'replay') steps.push({ kind: 'wait', ms: 6000 }, { kind: 'replay', speed: 1 });
  return steps;
}

export function cycleScenario(mode: TakeMode): Scenario {
  return {
    name: 'cycle',
    mode,
    steps: [
      ...opening(mode),
      { kind: 'waitForPhase', phase: 'detected', timeoutMs: EPISODE_TIMEOUT_MS },
      { kind: 'marker', name: 'detection' },
      { kind: 'wait', ms: 1500 },
      { kind: 'marker', name: 'reveil' },
      { kind: 'waitForText', selector: TRACE, text: 'Vues demandées', timeoutMs: EPISODE_TIMEOUT_MS },
      { kind: 'marker', name: 'observation' },
      { kind: 'waitForText', selector: TRACE, text: 'Ciseaux →', timeoutMs: EPISODE_TIMEOUT_MS },
      { kind: 'marker', name: 'positionnement' },
      // Cadrage coupe (`k`, issue #42) au premier `move_scissors` : c'est là que le geste devient
      // fin, et un plan large ne le montrera pas. L'incrustation de la caméra outil, elle, s'est
      // allumée toute seule quand les ciseaux ont quitté leur pose de repos — pas de `j` ici.
      { kind: 'press', key: 'k' },
      { kind: 'waitForText', selector: TRACE, text: 'Coupe', timeoutMs: EPISODE_TIMEOUT_MS },
      { kind: 'marker', name: 'coupe' },
      { kind: 'waitForText', selector: TRACE, text: 'dans le panier', timeoutMs: EPISODE_TIMEOUT_MS },
      { kind: 'marker', name: 'chute' },
      // Retour au cadrage large deux secondes après la chute, en même temps que l'incrustation de
      // la caméra outil s'éteint (`TOOL_CAM_LINGER_S`). Le rapport arrive plusieurs secondes plus
      // tard : cette attente ne repousse pas le marqueur `rapport`.
      { kind: 'wait', ms: 2000 },
      { kind: 'press', key: 'k' },
      { kind: 'waitForText', selector: TRACE, text: 'Rapport :', timeoutMs: EPISODE_TIMEOUT_MS },
      { kind: 'marker', name: 'rapport' },
      // Queue courte, et c'est une contrainte, pas un réglage de confort : une fois l'épisode clos
      // la tomate suivante reprend son mûrissement et un second épisode — payant — démarrerait
      // pendant les cartons de fin. Au plus sept secondes après le rapport, arrêt compris.
      { kind: 'wait', ms: 3000 },
      { kind: 'marker', name: 'fin' },
      { kind: 'wait', ms: 1000 },
    ],
  };
}
