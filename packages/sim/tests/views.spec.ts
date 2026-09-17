import { expect, test } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const shotsDir = resolve(import.meta.dirname, '../../../data/shots');

test('renderViews returns three annotated 800×800 views with their JSON and captures them', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/');
  await page.waitForFunction(() => window.__tomato?.renderViews !== undefined, undefined, { timeout: 30_000 });

  const result = await page.evaluate(async () => {
    const t = window.__tomato!;
    const first = t.runtime.ctx.store.get().tomatoes[0];
    if (first) {
      // Sans M1, ripen_next répond not_available et la liste reste vide : le test doit passer quand même.
      t.runtime.apply({ type: 'ripen_next' });
      t.runtime.apply({ type: 'set_target', tomatoId: first.id });
    }
    return t.renderViews!(['top', 'front', 'side']);
  });

  expect(result.images.map((i) => i.camera)).toEqual(['top', 'front', 'side']);
  for (const img of result.images) {
    expect(img.widthPx).toBe(800);
    expect(img.heightPx).toBe(800);
    expect(img.pngBase64.startsWith('iVBOR')).toBe(true); // signature PNG, sans préfixe data:
    expect(img.pngBase64.length).toBeGreaterThan(10_000);
  }
  expect(Object.keys(result.json.cameras).sort()).toEqual(['front', 'side', 'top']);
  expect(result.json.limits.cameraPivotDeg).toBe(25);
  const tomatoCount = await page.evaluate(() => window.__tomato!.runtime.ctx.store.get().tomatoes.length);
  expect(result.json.tomatoes.length).toBe(tomatoCount);
  if (tomatoCount > 0) {
    expect(result.json.targetTomatoId).toBe(result.json.tomatoes[0]!.id);
    const totalVisible = result.json.tomatoes.reduce((s, t) => s + t.visibleIn.top + t.visibleIn.front + t.visibleIn.side, 0);
    expect(totalVisible).toBeGreaterThan(0); // la passe d'identifiants voit au moins une tomate quelque part
  }

  mkdirSync(shotsDir, { recursive: true });
  for (const img of result.images) {
    writeFileSync(resolve(shotsDir, `view-${img.camera}.png`), Buffer.from(img.pngBase64, 'base64'));
  }

  await page.getByTestId('refresh-views').click();
  await expect(page.locator('img[alt="vue front"]')).toBeVisible();
  expect(errors).toEqual([]);
});
