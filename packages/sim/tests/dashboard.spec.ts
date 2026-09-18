import { expect, test } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';

const shotsDir = resolve(import.meta.dirname, '../../../data/shots');

test('dashboard replays a scripted episode and is captured at 1920×1080 in both layouts', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/');
  await expect(page.getByTestId('spectator')).toBeVisible();
  await page.waitForFunction(() => window.__tomato?.attachBridge !== undefined, undefined, { timeout: 30_000 });

  // Épisode scripté injecté par le pont simulé, avec de vraies vues rendues par M3 si disponibles.
  const hasViews = await page.evaluate(async () => {
    const t = window.__tomato!;
    const views = t.renderViews ? await t.renderViews(['top', 'front', 'side']) : null;
    t.attachBridge!(t.fakeBridge!(t.demoScript!(views, t.runtime.ctx.store.get())));
    return views !== null;
  });

  const trace = page.getByTestId('trace');
  await expect(trace).toContainText('Épisode terminé : récoltée', { timeout: 20_000 });
  // Le scénario se termine par le retour en phase repos, 1 s après `episode_end` : on attend qu'il soit joué
  // en entier, sinon l'entrée de tête dépend de la vitesse de la page (M4 charge OpenCV en parallèle).
  await expect(trace.locator('li').first()).toContainText('Phase repos', { timeout: 15_000 }); // plus récent en haut
  await expect(trace.locator('li').nth(1)).toContainText('Épisode terminé : récoltée');
  await expect(trace.locator('li[data-ok="false"]').first()).toContainText('Ciseaux → X 8, Y −2, Z 41'); // erreur surlignée
  await expect(page.getByTestId('count-harvested')).toHaveText('1');
  await expect(page.getByTestId('cost')).toHaveText('0,0421 $');
  await expect(page.getByTestId('connection')).toContainText('replay');
  await expect(page.getByTestId('block-last-flow')).toContainText('server → dashboard');
  if (hasViews) await expect(page.locator('img[alt="vue front"]')).toBeVisible();

  mkdirSync(shotsDir, { recursive: true });
  await page.screenshot({ path: resolve(shotsDir, 'dashboard.png') });

  // Cadre de tournage : vues agrandies (v) et contrôles masqués (h).
  await page.keyboard.press('v');
  await expect(page.getByTestId('dashboard')).toHaveAttribute('data-layout', 'agent');
  await page.keyboard.press('h');
  await expect(page.getByTestId('controls')).toHaveCount(0);
  await page.waitForTimeout(500);
  await page.screenshot({ path: resolve(shotsDir, 'dashboard-agentview.png') });

  await page.keyboard.press('h');
  await expect(page.getByTestId('controls')).toBeVisible();
  await page.keyboard.press('v');
  await expect(page.getByTestId('dashboard')).toHaveAttribute('data-layout', 'normal');

  expect(errors).toEqual([]);
});
