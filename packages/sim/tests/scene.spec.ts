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
  await page.waitForFunction(() => window.__tomato?.runtime.ctx.registry.plantSpec !== null, undefined, { timeout: 30_000 });
  const tomatoCount = await page.evaluate(() => window.__tomato!.runtime.ctx.store.get().tomatoes.length);
  expect(tomatoCount).toBeGreaterThanOrEqual(4);
  const ripen = await page.evaluate(() => window.__tomato!.runtime.apply({ type: 'ripen_next' }));
  expect(ripen.ok).toBe(true);
  await page.waitForTimeout(1500);
  const states = await page.evaluate(() => window.__tomato!.runtime.ctx.store.get().tomatoes.map((t) => t.state));
  expect(states).toContain('ripe');
  mkdirSync(shotsDir, { recursive: true });
  await page.screenshot({ path: resolve(shotsDir, 'scene.png') });
  expect(errors).toEqual([]);
});
