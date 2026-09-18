/** Exécution d'une étape de scénario sur la page Playwright. */
import type { Page } from 'playwright';
import type { ScriptEntry } from './episodes';
import type { MarkerLog } from './markers';
import type { ScenarioStep } from './scenario';
import './pageGlobals';

const DEFAULT_TIMEOUT_MS = 90_000;
/** Cellule « mûrissement » du bandeau de statuts (`StatusBar`, M7). */
const RIPENING = '[data-testid="ripening"]';
/** Période de scrutation du mûrissement : le pourcentage monte d'un point toutes les 150 ms. */
const RIPENING_POLL_MS = 120;

export interface StepContext {
  readonly log: MarkerLog;
  /** Messages du journal à rejouer, déjà ramenés à zéro (étape `replay`). */
  readonly episode: readonly ScriptEntry[];
  readonly onStep?: (label: string) => void;
}

/** La phase active est la pastille `aria-current="step"` du bandeau de statuts (M7). */
function phaseSelector(phase: string): string {
  return `[data-phase="${phase}"][aria-current="step"]`;
}

/**
 * Maturité lue dans la cellule « mûrissement » : « tomate 1 : mûrit 62 % » → 62, « tomate 1 : mûre »
 * → 100, « — » (rien ne mûrit) → `null`. Pur, testé sans navigateur.
 */
export function ripeningPercent(text: string): number | null {
  const percent = /mûrit\s+(\d+)\s*%/u.exec(text);
  if (percent !== null) return Number(percent[1]);
  return /mûre/u.test(text) ? 100 : null;
}

/** Attend le seuil de maturité en scrutant le bandeau, plutôt que de viser un pour cent précis. */
async function waitForRipeness(page: Page, minPercent: number, timeoutMs: number): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  let last = '';
  for (;;) {
    last = (await page.locator(RIPENING).first().textContent()) ?? '';
    const percent = ripeningPercent(last);
    if (percent !== null && percent >= minPercent) return;
    if (Date.now() >= deadline) {
      throw new Error(`mûrissement : ${minPercent} % jamais atteint en ${timeoutMs} ms (bandeau : « ${last} »)`);
    }
    await page.waitForTimeout(RIPENING_POLL_MS);
  }
}

async function injectReplay(page: Page, entries: readonly ScriptEntry[], speed: number): Promise<void> {
  if (entries.length === 0) throw new Error('étape « replay » sans journal : passer --episode <id ou chemin>');
  await page.evaluate(
    (payload: { entries: readonly ScriptEntry[]; speed: number }) => {
      const t = window.__tomato;
      if (t?.attachBridge === undefined || t.fakeBridge === undefined) {
        throw new Error('page sans pont simulé : lancer la sim avec « npm run dev » (mode développement)');
      }
      t.attachBridge(t.fakeBridge(payload.entries, payload.speed));
    },
    { entries, speed },
  );
}

export async function runStep(page: Page, step: ScenarioStep, ctx: StepContext): Promise<void> {
  switch (step.kind) {
    case 'wait':
      ctx.onStep?.(`attente ${step.ms} ms`);
      await page.waitForTimeout(step.ms);
      return;
    case 'press':
      ctx.onStep?.(`touche ${step.key}`);
      await page.keyboard.press(step.key);
      return;
    case 'click':
      ctx.onStep?.(`clic ${step.selector}`);
      await page.locator(step.selector).first().click({ timeout: DEFAULT_TIMEOUT_MS });
      return;
    case 'waitForPhase':
      ctx.onStep?.(`phase ${step.phase}`);
      await page.locator(phaseSelector(step.phase)).first().waitFor({ state: 'visible', timeout: step.timeoutMs ?? DEFAULT_TIMEOUT_MS });
      return;
    case 'waitForText':
      ctx.onStep?.(`texte « ${step.text} »`);
      await page.waitForFunction(
        (p: { selector: string; text: string }) => (document.querySelector(p.selector)?.textContent ?? '').includes(p.text),
        { selector: step.selector, text: step.text },
        { timeout: step.timeoutMs ?? DEFAULT_TIMEOUT_MS },
      );
      return;
    case 'waitForSelector':
      ctx.onStep?.(`élément ${step.selector}`);
      await page.locator(step.selector).first().waitFor({ state: 'visible', timeout: step.timeoutMs ?? DEFAULT_TIMEOUT_MS });
      return;
    case 'waitForRipeness':
      ctx.onStep?.(`mûrissement ≥ ${step.minPercent} %`);
      await waitForRipeness(page, step.minPercent, step.timeoutMs ?? DEFAULT_TIMEOUT_MS);
      return;
    case 'marker':
      ctx.log.mark(step.name);
      ctx.onStep?.(`marqueur ${step.name}`);
      return;
    case 'replay':
      ctx.onStep?.(`replay du journal ×${step.speed ?? 1}`);
      await injectReplay(page, ctx.episode, step.speed ?? 1);
      return;
    case 'sim':
      ctx.onStep?.(`sim ${step.action}`);
      await page.evaluate((action: string) => {
        window.__tomato?.runtime.applyNow({ type: action });
      }, step.action);
      return;
  }
}
