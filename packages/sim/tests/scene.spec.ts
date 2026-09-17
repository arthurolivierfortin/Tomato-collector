import { expect, test } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';

const shotsDir = resolve(import.meta.dirname, '../../../data/shots');

test('spectator scene renders the plant module and is captured', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/');
  const canvas = page.getByTestId('spectator');
  await expect(canvas).toBeVisible();
  // `window.__tomato?.…  !== null` serait vrai tant que __tomato est undefined : tester les deux.
  await page.waitForFunction(
    () => window.__tomato !== undefined && window.__tomato.runtime.ctx.registry.plantSpec !== null,
    undefined,
    { timeout: 30_000 },
  );
  const tomatoCount = await page.evaluate(() => window.__tomato!.runtime.ctx.store.get().tomatoes.length);
  expect(tomatoCount).toBeGreaterThanOrEqual(4);
  const ripen = await page.evaluate(() => window.__tomato!.runtime.apply({ type: 'ripen_next' }));
  expect(ripen.ok).toBe(true);
  // `ripen_next` rend rouge la tomate qui était en transition ; on accélère le temps sim pour que
  // la suivante entre dans sa rampe, et que la capture montre bien du rouge, de l'orange et du vert.
  await page.evaluate(() => window.__tomato!.runtime.apply({ type: 'set_time_scale', scale: 20 }));
  await page.waitForTimeout(2200);
  const states = await page.evaluate(() => window.__tomato!.runtime.ctx.store.get().tomatoes.map((t) => t.state));
  expect(states).toContain('ripe');
  expect(states).toContain('turning');
  expect(states).toContain('unripe');
  mkdirSync(shotsDir, { recursive: true });
  await page.screenshot({ path: resolve(shotsDir, 'scene.png') });
  expect(errors).toEqual([]);
});
