import { expect, test } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';

const shotsDir = resolve(import.meta.dirname, '../../../data/shots');

test('robot arm follows the scissors and the basket slides on its rail', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/');
  await expect(page.getByTestId('spectator')).toBeVisible();
  await page.waitForFunction(() => window.__tomato !== undefined);

  // Coordonnées choisies hors du feuillage du plant de graine 20260917 (tomates en +X, tige en |x|,|y| < 2).
  // Issue #21 : les actions des outils sont animées et ne répondent qu'à la fin du mouvement ; on attend
  // donc les promesses. Les ciseaux s'exécutent dans l'ordre (une file par outil), le panier en parallèle.
  const results = await page.evaluate(async () => {
    const rt = window.__tomato!.runtime;
    const done = await Promise.all([
      rt.apply({ type: 'open_scissors' }),
      rt.apply({ type: 'move_scissors', x: 30, y: -8, z: 58, mode: 'absolute' }),
      rt.apply({ type: 'rotate_scissors', yaw: 20, mode: 'relative' }),
      rt.apply({ type: 'move_basket', x: 19, y: -8, mode: 'absolute' }),
    ]);
    return done.map((r) => ({ ok: r.ok, message: r.message }));
  });
  for (const r of results) expect(r.ok, r.message).toBe(true);

  const scissors = await page.evaluate(() => window.__tomato!.runtime.ctx.store.get().scissors);
  expect(scissors.cutPointCm).toEqual([30, -8, 58]);
  expect(scissors.openingDeg).toBe(60);
  expect(scissors.yawDeg).toBe(20);

  await page.waitForTimeout(1000);
  mkdirSync(shotsDir, { recursive: true });
  await page.screenshot({ path: resolve(shotsDir, 'robot.png') });
  expect(errors).toEqual([]);
});
