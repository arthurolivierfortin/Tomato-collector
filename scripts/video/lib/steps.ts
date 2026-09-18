/** Exécution d'une étape de scénario sur la page Playwright. */
import type { Page } from 'playwright';
import type { ScriptEntry } from './episodes';
import type { MarkerLog } from './markers';
import type { ScenarioStep } from './scenario';
import './pageGlobals';

const DEFAULT_TIMEOUT_MS = 90_000;

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

async function injectDemo(page: Page, speed: number): Promise<void> {
  await page.evaluate(async (s: number) => {
    const t = window.__tomato;
    if (t?.attachBridge === undefined || t.fakeBridge === undefined || t.demoScript === undefined) {
      throw new Error('page sans pont simulé : lancer la sim avec « npm run dev » (mode développement)');
    }
    const views = t.renderViews === undefined ? null : await t.renderViews(['top', 'front', 'side']);
    t.attachBridge(t.fakeBridge(t.demoScript(views, t.runtime.ctx.store.get()), s));
  }, speed);
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
    case 'marker':
      ctx.log.mark(step.name);
      ctx.onStep?.(`marqueur ${step.name}`);
      return;
    case 'demo':
      ctx.onStep?.(`épisode scripté ×${step.speed ?? 1}`);
      await injectDemo(page, step.speed ?? 1);
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
