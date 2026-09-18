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

  // Issue #22 : les trois vues sont conservées par caméra, la vue mise en avant est en grand (≥ 600 px).
  if (hasViews) {
    await expect(page.locator('img[alt="vue front"]')).toBeVisible();
    await expect(page.getByTestId('view-thumb-top').locator('img')).toBeVisible();
    await expect(page.getByTestId('view-thumb-side').locator('img')).toBeVisible();
    const big = await page.getByTestId('view-featured').locator('img').boundingBox();
    expect(big!.width).toBeGreaterThanOrEqual(600);
    expect(big!.height).toBeGreaterThanOrEqual(600);
    await expect(page.getByTestId('view-featured')).toContainText('il y a');
  }

  // Issue #22 : la trace montre les arguments et le résultat des appels en JSON, dépliés pour les 3 derniers.
  const lastCall = trace.locator('li[data-kind="tool"]').first();
  await expect(lastCall.getByTestId(/^trace-args-/)).toContainText('"outcome": "harvested"');
  await expect(lastCall.getByTestId(/^trace-result-/)).toBeVisible();
  await expect(trace).toContainText('"angleDeg": 78'); // résultat de la coupe, déplié d'office
  await expect(trace).not.toContainText('iVBORw0KGgo');

  mkdirSync(shotsDir, { recursive: true });
  await page.screenshot({ path: resolve(shotsDir, 'dashboard.png') });

  // Repli d'un appel : le JSON disparaît, le bouton le ramène.
  const fold = lastCall.getByRole('button', { name: /Replier le JSON/ });
  await fold.click();
  await expect(lastCall.getByTestId(/^trace-args-/)).toHaveCount(0);
  await lastCall.getByRole('button', { name: /Déplier le JSON/ }).click();
  await expect(lastCall.getByTestId(/^trace-args-/)).toBeVisible();

  // Clic sur une vignette : elle passe en grand.
  if (hasViews) {
    await page.getByTestId('view-thumb-top').getByRole('button').click();
    await expect(page.getByTestId('view-featured')).toHaveAttribute('data-camera', 'top');
  }

  // Issue #22 : loupe plein écran (touche z), zoom à la molette, changement de caméra, fermeture par Échap.
  await page.keyboard.press('z');
  const lightbox = page.getByTestId('lightbox');
  await expect(lightbox).toBeVisible();
  await lightbox.getByRole('button', { name: 'Vue front', exact: true }).click();
  await expect(lightbox).toContainText('×1,0');
  await page.mouse.move(960, 500);
  await page.mouse.wheel(0, -240);
  await expect(lightbox).not.toContainText('×1,0');
  await page.waitForTimeout(300);
  await page.screenshot({ path: resolve(shotsDir, 'dashboard-lightbox.png') });
  await page.keyboard.press('Escape');
  await expect(lightbox).toHaveCount(0);

  // Issue #18 : gizmos de caméra discrets, masqués par défaut, affichés par la touche c.
  await page.keyboard.press('c');
  await expect(page.getByRole('button', { name: 'Caméras (c)' })).toHaveAttribute('aria-pressed', 'true');
  await page.screenshot({ path: resolve(shotsDir, 'dashboard-cameras.png') });
  await page.keyboard.press('c');
  await expect(page.getByRole('button', { name: 'Caméras (c)' })).toHaveAttribute('aria-pressed', 'false');

  // Cadre de tournage : vues agrandies (v) et contrôles masqués (h).
  await page.keyboard.press('v');
  await expect(page.getByTestId('dashboard')).toHaveAttribute('data-layout', 'agent');
  await expect(page.getByTestId('view-featured')).toHaveCount(3);
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
