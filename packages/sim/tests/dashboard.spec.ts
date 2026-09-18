import { expect, test } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';

const shotsDir = resolve(import.meta.dirname, '../../../data/shots');

test('dashboard replays a scripted episode and is captured at 1920×1080 in both layouts', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/');
  // Issue #31 : favicon déclarée et servie — c'était la seule erreur console de la session (404 .ico).
  await expect(page.locator('link[rel="icon"]')).toHaveAttribute('href', '/favicon.svg');
  expect((await page.request.get('/favicon.svg')).ok()).toBe(true);
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

  // Issue #31 : la colonne spectateur se resserre en mode v — la barre de contrôles doit se replier,
  // jamais être tranchée (« Arrêter » coupé en deux, état du replay hors champ).
  const bar = await page.getByTestId('controls').evaluate((el) => ({ content: el.scrollWidth, useful: el.clientWidth }));
  console.log(`contrôles en mode v : ${bar.content} px de contenu pour ${bar.useful} px utiles`);
  expect(bar.content).toBeLessThanOrEqual(bar.useful);
  const cut = await page.getByTestId('controls').evaluate((el) => {
    const right = el.getBoundingClientRect().right;
    return [...el.querySelectorAll('button, select, span')]
      .filter((c) => c.getBoundingClientRect().right > right + 1)
      .map((c) => (c.textContent ?? '').trim());
  });
  expect(cut).toEqual([]);

  // Issue #31 : les trois vues carrées exploitent la hauteur — aucune bande noire (la tuile est carrée
  // comme l'image) et la vue mise en avant n'est pas plus petite qu'en mode normal (613 px).
  if (hasViews) {
    const tiles = await page
      .getByTestId('view-featured')
      .locator('button')
      .evaluateAll((els) => els.map((e) => ({ w: e.clientWidth, h: e.clientHeight })));
    console.log(`tuiles en mode v : ${tiles.map((t) => `${t.w}×${t.h}`).join(', ')}`);
    for (const t of tiles) expect(Math.abs(t.w - t.h)).toBeLessThanOrEqual(2);
    expect(Math.max(...tiles.map((t) => t.h))).toBeGreaterThanOrEqual(613);
    expect(Math.min(...tiles.map((t) => t.h))).toBeGreaterThanOrEqual(360);
  }
  await page.keyboard.press('h');
  await expect(page.getByTestId('controls')).toHaveCount(0);
  await page.waitForTimeout(500);
  await page.screenshot({ path: resolve(shotsDir, 'dashboard-agentview.png') });

  await page.keyboard.press('h');
  await expect(page.getByTestId('controls')).toBeVisible();
  await page.keyboard.press('v');
  await expect(page.getByTestId('dashboard')).toHaveAttribute('data-layout', 'normal');

  // Issue #23 partie C : le panneau « Session agent (brut) » se replie et se déplie à la touche t.
  const session = page.getByTestId('agent-session');
  await expect(session).toBeVisible();
  await page.keyboard.press('t');
  await expect(session).toHaveCount(0);
  await page.keyboard.press('t');
  await expect(session).toBeVisible();

  // Rejoué depuis le début : on capture le moment clé, quand le bandeau de réveil est encore affiché
  // et que le flux brut de la session a commencé à défiler.
  await page.evaluate(async () => {
    const t = window.__tomato!;
    const views = t.renderViews ? await t.renderViews(['top', 'front', 'side']) : null;
    t.attachBridge!(t.fakeBridge!(t.demoScript!(views, t.runtime.ctx.store.get())));
  });
  await expect(page.getByTestId('wake-banner')).toBeVisible({ timeout: 15_000 });
  await expect(trace.locator('li[data-kind="wake"]').first()).toContainText('réveil de l’agent');
  await expect(session).toContainText('MCP robot : connected');
  await expect(session).toContainText('get_views');
  // Le bloc Agent reste allumé tant que l'épisode court, indépendamment de la flèche en cours.
  await expect(page.locator('[data-block="agent"][data-active="true"]')).toHaveCount(1);
  // La vue mise en avant n'a rien perdu : le panneau brut vit dans la colonne de la trace, et le
  // bandeau de réveil est en surimpression. 613 px, comme avant l'issue #23 (revue de la PR #28).
  if (hasViews) {
    const big = await page.getByTestId('view-featured').locator('img').boundingBox();
    console.log(`vue mise en avant : ${big!.width} × ${big!.height} px`);
    expect(big!.height).toBeGreaterThanOrEqual(613);
    expect(big!.width).toBeGreaterThanOrEqual(613);
    // Le panneau brut lit confortablement : au moins 20 rem de haut (revue de tournage).
    const panel = await session.boundingBox();
    console.log(`panneau brut : ${panel!.height} px`);
    expect(panel!.height).toBeGreaterThanOrEqual(320);
  }
  await page.screenshot({ path: resolve(shotsDir, 'dashboard-agent-session.png') });

  // Issue #31 : le schéma bloc tombait pile à 1080 px, sans aucune marge basse.
  const svg = (await page.locator('#block-diagram-svg').boundingBox())!;
  const bottomGapPx = 1080 - (svg.y + svg.height);
  console.log(`marge sous le schéma bloc : ${bottomGapPx} px`);
  expect(bottomGapPx).toBeGreaterThanOrEqual(6);

  expect(errors).toEqual([]);
});
