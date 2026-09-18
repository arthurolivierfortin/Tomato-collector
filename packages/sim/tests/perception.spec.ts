import { expect, test } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const shotsDir = resolve(import.meta.dirname, '../../../data/shots');
const RIPEN_ATTEMPTS = 3;
const WAKE_TIMEOUT_MS = 15_000;

test('perception: Canny edges once OpenCV is loaded, detector badge, wake-up on a ripe tomato', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/');
  await page.waitForFunction(() => window.__tomato?.renderViews !== undefined);
  await page.waitForFunction(() => window.__tomatoPerception?.state().opencvReady === true, null, { timeout: 30_000 });
  // Issue #36 : le modèle est livré avec le dépôt ; le spec doit prouver le chemin modèle, pas le repli.
  await page.waitForFunction(() => window.__tomatoPerception?.state().yoloReady === true, null, { timeout: 60_000 });

  const png = await page.evaluate(async () => (await window.__tomato!.renderViews!(['front'])).images[0]!.pngBase64);
  mkdirSync(shotsDir, { recursive: true });
  writeFileSync(resolve(shotsDir, 'view-front-canny.png'), Buffer.from(png, 'base64'));
  await expect(page.getByTestId('perception-badge')).toContainText('Canny');

  // Réveil : mûrir des tomates jusqu'à ce que l'une soit vue par la caméra front (M1 requis ; sinon ripen_next échoue et on saute).
  await page.evaluate(() => {
    window.__tomato!.runtime.onEvent((e) => {
      if (e.type === 'ripe_detected') window.__tomatoPerception!.events.push(e);
    });
  });
  let ripenOk = false;
  for (let attempt = 0; attempt < RIPEN_ATTEMPTS; attempt++) {
    const result = await page.evaluate(() => window.__tomato!.runtime.apply({ type: 'ripen_next' }));
    if (!result.ok) break;
    ripenOk = true;
    const woke = await page
      .waitForFunction(() => window.__tomatoPerception!.events.length > 0, null, { timeout: WAKE_TIMEOUT_MS })
      .then(() => true, () => false);
    if (woke) break;
  }
  // `lastImage` est la frame 640×640 d'entrée du détecteur : on n'en garde que la taille, sinon le JSON pèse 33 Mo.
  const state = await page.evaluate(() => {
    const { lastImage, ...rest } = window.__tomatoPerception!.state();
    return { ...rest, frame: lastImage === null ? null : { width: lastImage.width, height: lastImage.height }, events: window.__tomatoPerception!.events };
  });
  writeFileSync(resolve(shotsDir, 'perception.json'), JSON.stringify({ ripenOk, ...state }, null, 2));
  await page.screenshot({ path: resolve(shotsDir, 'perception.png') });
  if (ripenOk) {
    // Le réveil doit venir du modèle : c'est lui qui décide dès qu'il est chargé (revue de PR #38).
    expect(state.events[0]).toMatchObject({
      type: 'ripe_detected',
      tomatoId: expect.any(Number),
      detector: 'yolo',
      confidence: expect.any(Number),
    });
    expect(state.lastDetector).toBe('yolo');
  }

  // Issue #36 : panneau « Perception » (touche p) — la frame d'entrée du détecteur, ses boîtes, son nom.
  await page.keyboard.press('p');
  const panel = page.getByTestId('perception-panel');
  await expect(panel).toBeVisible();
  await expect(page.getByTestId('perception-detector')).toHaveText('YOLOv8n ONNX 640');
  await expect(page.getByTestId('perception-gate')).toContainText('frames consécutives');
  await expect(page.getByTestId('perception-inference')).toContainText('ms');
  // La vue mise en avant garde ses 613 px : le panneau vit dans la colonne de trace (issue #22).
  const featured = await page.getByTestId('view-featured').locator('img').boundingBox();
  if (featured) expect(featured.width).toBeGreaterThanOrEqual(600);
  await page.screenshot({ path: resolve(shotsDir, 'dashboard-perception.png') });

  // Issue #36 : mode « Pipeline de traitement » (touche x) — les dix tampons intermédiaires réels.
  await page.keyboard.press('x');
  await expect(page.getByTestId('pipeline')).toBeVisible();
  const tiles = page.getByTestId('pipeline-tile');
  await expect(tiles).toHaveCount(10, { timeout: WAKE_TIMEOUT_MS });
  await expect(tiles.first()).toContainText('Image caméra brute');
  await expect(tiles.nth(7)).toContainText('simulation');
  await expect(tiles.last()).toContainText('Vue finale envoyée à l’agent');
  await expect(tiles.locator('img')).toHaveCount(10);
  await page.screenshot({ path: resolve(shotsDir, 'dashboard-pipeline.png') });
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('pipeline')).toHaveCount(0);

  expect(errors).toEqual([]);
});
