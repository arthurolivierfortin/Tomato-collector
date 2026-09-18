/**
 * Scénario d'enregistrement : la liste d'étapes que `record.ts` joue sur la page. Le parseur est
 * pur et strict — une étape mal formée doit échouer avant que la caméra tourne, pas au milieu
 * d'une prise de quatre minutes.
 */
import type { TakeMode } from './markers';

export type SimAction = 'ripen_next' | 'new_plant';

export type ScenarioStep =
  | { readonly kind: 'wait'; readonly ms: number }
  | { readonly kind: 'press'; readonly key: string }
  | { readonly kind: 'click'; readonly selector: string }
  | { readonly kind: 'waitForPhase'; readonly phase: string; readonly timeoutMs?: number }
  | { readonly kind: 'waitForText'; readonly selector: string; readonly text: string; readonly timeoutMs?: number }
  | { readonly kind: 'marker'; readonly name: string }
  /** Injecte l'épisode scripté de la page (`buildDemoScript`) ; `speed` < 1 ralentit. */
  | { readonly kind: 'demo'; readonly speed?: number }
  /** Rejoue le journal d'épisode passé en option `--episode` via le pont simulé. */
  | { readonly kind: 'replay'; readonly speed?: number }
  | { readonly kind: 'sim'; readonly action: SimAction };

export interface Scenario {
  readonly name: string;
  readonly mode: TakeMode;
  readonly steps: readonly ScenarioStep[];
}

function isRecord(x: unknown): x is Record<string, unknown> {
  return typeof x === 'object' && x !== null;
}

function str(o: Record<string, unknown>, key: string): string {
  const v = o[key];
  if (typeof v !== 'string' || v === '') throw new Error(`« ${key} » manquant ou vide`);
  return v;
}

function num(o: Record<string, unknown>, key: string): number {
  const v = o[key];
  if (typeof v !== 'number' || !Number.isFinite(v)) throw new Error(`« ${key} » manquant ou non numérique`);
  return v;
}

function optNum(o: Record<string, unknown>, key: string): { [k: string]: number } {
  const v = o[key];
  if (v === undefined) return {};
  if (typeof v !== 'number' || !Number.isFinite(v)) throw new Error(`« ${key} » non numérique`);
  return { [key]: v };
}

function parseStep(raw: unknown): ScenarioStep {
  if (!isRecord(raw)) throw new Error('étape non lisible');
  const kind = raw['kind'];
  switch (kind) {
    case 'wait':
      return { kind, ms: num(raw, 'ms') };
    case 'press':
      return { kind, key: str(raw, 'key') };
    case 'click':
      return { kind, selector: str(raw, 'selector') };
    case 'waitForPhase':
      return { kind, phase: str(raw, 'phase'), ...optNum(raw, 'timeoutMs') };
    case 'waitForText':
      return { kind, selector: str(raw, 'selector'), text: str(raw, 'text'), ...optNum(raw, 'timeoutMs') };
    case 'marker':
      return { kind, name: str(raw, 'name') };
    case 'demo':
    case 'replay':
      return { kind, ...optNum(raw, 'speed') };
    case 'sim': {
      const action = str(raw, 'action');
      if (action !== 'ripen_next' && action !== 'new_plant') throw new Error(`action de sim inconnue : ${action}`);
      return { kind, action };
    }
    default:
      throw new Error(`type d’étape inconnu : ${String(kind)}`);
  }
}

export function parseScenario(raw: unknown): Scenario {
  if (!isRecord(raw)) throw new Error('scénario non lisible');
  const name = str(raw, 'name');
  const mode = raw['mode'];
  if (mode !== 'live' && mode !== 'replay') throw new Error(`mode inconnu : ${String(mode)} (attendu « live » ou « replay »)`);
  const rawSteps = raw['steps'];
  if (!Array.isArray(rawSteps) || rawSteps.length === 0) throw new Error(`scénario « ${name} » : aucune étape`);
  const steps = rawSteps.map((s, i) => {
    try {
      return parseStep(s);
    } catch (e) {
      throw new Error(`scénario « ${name} », étape ${i + 1} : ${e instanceof Error ? e.message : String(e)}`);
    }
  });
  const names = steps.flatMap((s) => (s.kind === 'marker' ? [s.name] : []));
  const doubled = names.find((n, i) => names.indexOf(n) !== i);
  if (doubled !== undefined) throw new Error(`scénario « ${name} » : marqueur « ${doubled} » posé deux fois`);
  return { name, mode, steps };
}

export function scenarioMarkers(scenario: Scenario): string[] {
  return scenario.steps.flatMap((s) => (s.kind === 'marker' ? [s.name] : []));
}

/** Somme des attentes fixes : une borne basse de la durée de la prise, pour annoncer l'ordre de grandeur. */
export function minimumDurationMs(scenario: Scenario): number {
  return scenario.steps.reduce((sum, s) => sum + (s.kind === 'wait' ? s.ms : 0), 0);
}
