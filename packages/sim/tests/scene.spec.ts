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
  // Issue #23 : un seul fruit mûrit à la fois. `ripen_next` rend rouge le fruit en cours et le
  // suivant ne démarre sa rampe que 4 s sim APRÈS sa coupe : on coupe donc le fruit rouge, puis
  // on accélère le temps sim jusqu'à ce que le suivant entre dans sa rampe, et on gèle la sim DANS
  // LA MÊME FRAME que la détection. Attendre l'état plutôt qu'un délai fixe rend la capture
  // reproductible : sans le gel, la seconde que prend page.screenshot avançait de 20 à 40 s sim
  // et tout finissait rouge.
  const states = await page.evaluate(async () => {
    const rt = window.__tomato!.runtime;
    const ripe = rt.ctx.store.get().tomatoes.find((t) => t.state === 'ripe');
    if (ripe) rt.ctx.signals.emit({ type: 'tomato_cut', tomatoId: ripe.id });
    rt.apply({ type: 'set_time_scale', scale: 20 });
    const deadline = performance.now() + 30_000;
    const freeze = (): void => {
      rt.apply({ type: 'set_time_scale', scale: 1 });
      rt.apply({ type: 'set_paused', paused: true });
    };
    await new Promise<void>((resolve) => {
      const tick = (): void => {
        if (rt.ctx.store.get().tomatoes.some((t) => t.state === 'turning') || performance.now() > deadline) {
          freeze();
          resolve();
          return;
        }
        requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    });
    const s = rt.ctx.store.get();
    return { states: s.tomatoes.map((t) => t.state), paused: s.paused, timeScale: s.timeScale };
  });
  // État gelé et déterministe : la tomate de `ripen_next` est rouge (coupée, elle garde sa couleur
  // en tombant), exactement une autre est en transition, le reste est vert.
  expect(states.paused).toBe(true);
  expect(states.timeScale).toBe(1);
  expect(states.states.filter((s) => s === 'ripe')).toHaveLength(1);
  expect(states.states.filter((s) => s === 'turning')).toHaveLength(1);
  expect(states.states.filter((s) => s === 'unripe').length).toBeGreaterThanOrEqual(2);
  mkdirSync(shotsDir, { recursive: true });
  await page.screenshot({ path: resolve(shotsDir, 'scene.png') });
  expect(errors).toEqual([]);
});
