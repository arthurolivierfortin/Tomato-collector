import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { CUT_FRAMING, WIDE_FRAMING } from '../src/three/spectatorFraming';

const shotsDir = resolve(import.meta.dirname, '../../../data/shots');

/** Position de la caméra spectateur, en monde (X droite, Y arrière, Z haut), arrondie au cm. */
const eyeCm = async (page: Page): Promise<number[]> =>
  page.evaluate(() => {
    const p = window.__tomato!.runtime.ctx.scene!.camera.position;
    return [Math.round(p.x), Math.round(-p.z), Math.round(p.y)];
  });

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
  // Issue #21 : `apply` attend la fin du mouvement ; ici tout est immédiat, on prend `applyNow`.
  const ripen = await page.evaluate(() => window.__tomato!.runtime.applyNow({ type: 'ripen_next' }));
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
    rt.applyNow({ type: 'set_time_scale', scale: 20 });
    const deadline = performance.now() + 30_000;
    const freeze = (): void => {
      rt.applyNow({ type: 'set_time_scale', scale: 1 });
      rt.applyNow({ type: 'set_paused', paused: true });
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

// Issue #42 : la vue spectateur s'ouvre sur le cadrage large, et `k` bascule sur la zone de coupe.
test('the spectator view opens on the wide framing and k toggles the cut framing', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/');
  await expect(page.getByTestId('spectator')).toBeVisible();
  await page.waitForFunction(() => window.__tomato !== undefined && window.__tomato.runtime.ctx.scene !== null, undefined, { timeout: 30_000 });

  expect(await eyeCm(page)).toEqual(WIDE_FRAMING.eyeCm);
  await page.keyboard.press('k');
  await expect.poll(() => eyeCm(page), { timeout: 5_000 }).toEqual(CUT_FRAMING.eyeCm);
  mkdirSync(shotsDir, { recursive: true });
  await page.screenshot({ path: resolve(shotsDir, 'scene-cut-framing.png') });
  await page.keyboard.press('k');
  await expect.poll(() => eyeCm(page), { timeout: 5_000 }).toEqual(WIDE_FRAMING.eyeCm);
  expect(errors).toEqual([]);
});

// Issue #42 : l'incrustation de la caméra outil s'allume dès que les ciseaux quittent le repos.
test('the tool camera inset shows up once the scissors move, and j forces it off', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/');
  await expect(page.getByTestId('spectator')).toBeVisible();
  await page.waitForFunction(() => window.__tomato !== undefined && window.__tomato.runtime.ctx.scene !== null, undefined, { timeout: 30_000 });
  await expect(page.getByTestId('tool-camera')).toHaveCount(0);

  const moved = await page.evaluate(() => window.__tomato!.runtime.applyNow({ type: 'move_scissors', x: 30, y: -8, z: 58, mode: 'absolute' }));
  expect(moved.ok, moved.message).toBe(true);
  await expect(page.getByTestId('tool-camera')).toBeVisible({ timeout: 5_000 });
  mkdirSync(shotsDir, { recursive: true });
  await page.screenshot({ path: resolve(shotsDir, 'scene-tool-camera.png') });

  await page.keyboard.press('j');
  await expect(page.getByTestId('tool-camera')).toHaveCount(0, { timeout: 5_000 });
  expect(errors).toEqual([]);
});
