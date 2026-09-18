import { describe, expect, it } from 'vitest';
import { parseScenario, scenarioMarkers, minimumDurationMs } from './scenario';

const raw = {
  name: 'concepts',
  mode: 'replay',
  steps: [
    { kind: 'marker', name: 'app' },
    { kind: 'wait', ms: 1500 },
    { kind: 'press', key: 'b' },
    { kind: 'waitForPhase', phase: 'harvested' },
    { kind: 'click', selector: '[data-testid="view-thumb-top"] button' },
    { kind: 'waitForText', selector: '[data-testid="trace"]', text: 'récoltée' },
    { kind: 'demo', speed: 0.4 },
    { kind: 'replay', speed: 1 },
    { kind: 'sim', action: 'ripen_next' },
  ],
};

describe('parseScenario', () => {
  it('accepte un scénario complet et garde l’ordre des étapes', () => {
    const scenario = parseScenario(raw);
    expect(scenario.name).toBe('concepts');
    expect(scenario.mode).toBe('replay');
    expect(scenario.steps).toHaveLength(9);
    expect(scenario.steps[2]).toEqual({ kind: 'press', key: 'b' });
  });

  it('refuse un mode inconnu', () => {
    expect(() => parseScenario({ ...raw, mode: 'direct' })).toThrow(/mode/);
  });

  it('refuse une étape de type inconnu, en la situant', () => {
    expect(() => parseScenario({ ...raw, steps: [{ kind: 'scroll' }] })).toThrow(/étape 1.*scroll/s);
  });

  it('refuse une étape mal formée plutôt que de l’ignorer à l’enregistrement', () => {
    expect(() => parseScenario({ ...raw, steps: [{ kind: 'wait' }] })).toThrow(/étape 1/);
    expect(() => parseScenario({ ...raw, steps: [{ kind: 'marker', name: 42 }] })).toThrow(/étape 1/);
    expect(() => parseScenario({ ...raw, steps: [{ kind: 'sim', action: 'explode' }] })).toThrow(/étape 1/);
  });

  it('refuse un scénario sans étape', () => {
    expect(() => parseScenario({ ...raw, steps: [] })).toThrow(/aucune étape/);
  });
});

describe('scenarioMarkers', () => {
  it('liste les marqueurs posés, pour vérifier un plan avant de tourner', () => {
    expect(scenarioMarkers(parseScenario(raw))).toEqual(['app']);
  });

  it('refuse deux marqueurs du même nom', () => {
    const twice = { ...raw, steps: [{ kind: 'marker', name: 'app' }, { kind: 'marker', name: 'app' }] };
    expect(() => parseScenario(twice)).toThrow(/app/);
  });
});

describe('minimumDurationMs', () => {
  it('additionne les attentes fixes : une borne basse de la durée de la prise', () => {
    expect(minimumDurationMs(parseScenario(raw))).toBe(1500);
  });
});
