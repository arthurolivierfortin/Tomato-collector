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
  const state = await page.evaluate(() => ({ ...window.__tomatoPerception!.state(), events: window.__tomatoPerception!.events }));
  writeFileSync(resolve(shotsDir, 'perception.json'), JSON.stringify({ ripenOk, ...state }, null, 2));
  await page.screenshot({ path: resolve(shotsDir, 'perception.png') });
  if (ripenOk) {
    expect(state.events[0]).toMatchObject({ type: 'ripe_detected', tomatoId: expect.any(Number) });
    expect(['hsv', 'yolo']).toContain(state.lastDetector);
  }
  expect(errors).toEqual([]);
});
