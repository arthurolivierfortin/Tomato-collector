/**
 * Ce que le pilote fait de la page : attendre qu'elle soit prête, attendre le serveur, puis jouer
 * les étapes du scénario en posant les marqueurs.
 *
 * Sorti de `recorder.ts` pour le garder lisible : lui s'occupe des fichiers, des captures et des
 * marqueurs, ici on ne touche qu'à la page.
 */
import type { Page } from 'playwright';
import type { ScriptEntry } from './episodes';
import type { MarkerLog } from './markers';
import type { Scenario } from './scenario';
import { runStep } from './steps';
import './pageGlobals';

/** Attente maximale de la page et du serveur : un Vite froid met une dizaine de secondes. */
export const READY_TIMEOUT_MS = 120_000;

/** Ce dont `playSteps` a besoin ; `record()` lui passe ses propres options, qui en font partie. */
export interface PlayOptions {
  readonly scenario: Scenario;
  readonly episode: readonly ScriptEntry[];
  readonly log: (line: string) => void;
}

export function firstLine(e: unknown): string {
  const message = e instanceof Error ? e.message : String(e);
  return message.split('\n')[0] ?? message;
}

/** Attend que la scène soit montée ET que le pont de développement soit exposé (comme le test e2e). */
export async function waitForReady(page: Page): Promise<void> {
  await page.getByTestId('spectator').waitFor({ state: 'visible', timeout: READY_TIMEOUT_MS });
  await page.waitForFunction(() => window.__tomato?.attachBridge !== undefined, undefined, { timeout: READY_TIMEOUT_MS });
}

/** En direct, la prise n'a de sens qu'une fois le serveur branché : on l'attend explicitement. */
export async function waitForServer(page: Page, log: (line: string) => void): Promise<void> {
  log('mode direct : attente de « serveur connecté »…');
  await page.waitForFunction(
    () => (document.querySelector('[data-testid="connection"]')?.textContent ?? '').includes('serveur connecté'),
    undefined,
    { timeout: READY_TIMEOUT_MS },
  );
}

export async function playSteps(page: Page, options: PlayOptions, markerLog: MarkerLog): Promise<string | null> {
  const { scenario, log } = options;
  const gates = new Set<string>();
  for (const [i, step] of scenario.steps.entries()) {
    const position = `${i + 1}/${scenario.steps.length}`;
    let label: string = step.kind;
    try {
      await runStep(page, step, {
        log: markerLog,
        gates,
        episode: options.episode,
        onStep: (text) => {
          label = text;
          log(`  ${position.padStart(6, ' ')} ${text}`);
        },
      });
    } catch (e) {
      // La prise garde de la valeur : on rend la main pour l'écrire, en nommant l'étape fautive.
      return `étape ${position} (${label}) : ${firstLine(e)}`;
    }
  }
  return null;
}
