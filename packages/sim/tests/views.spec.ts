import { expect, test } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const shotsDir = resolve(import.meta.dirname, '../../../data/shots');

test('renderViews returns three annotated 800×800 views with their JSON and captures them', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/');
  await page.waitForFunction(() => window.__tomato?.renderViews !== undefined, undefined, { timeout: 30_000 });

  // Met la scène en situation de coupe : une tomate mûre ciblée, le panier sous elle et les ciseaux
  // ouverts sur son pédoncule. Sans cela les couches 3 et 4 (tige cible, schéma des ciseaux, panier,
  // verticale de chute) n'ont rien à annoter et les vues ne montrent pas ce que la spec 4.5 décrit.
  const setup = await page.evaluate(() => {
    const rt = window.__tomato!.runtime;
    // Sans M1, ripen_next répond not_available et la liste reste vide : le test doit passer quand même.
    if (rt.ctx.store.get().tomatoes.length === 0) return null;
    rt.apply({ type: 'ripen_next' });
    const s = rt.ctx.store.get();
    const target = s.tomatoes.find((t) => t.state === 'ripe') ?? s.tomatoes[0]!;
    rt.apply({ type: 'set_target', tomatoId: target.id });
    // Panier sous la tomate cible : la verticale de chute tombe alors dans le panier.
    const [tx, ty] = target.positionCm;
    const rail = s.limits.basketRailCm;
    const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v));
    const basket = rt.apply({ type: 'move_basket', x: clamp(tx, rail.x[0], rail.x[1]), y: clamp(ty, rail.y[0], rail.y[1]), mode: 'absolute' });
    // Point de coupe : milieu du pédoncule décalé de 2 cm vers l'ancre (fromCm = la branche).
    const { fromCm: a, toCm: b } = target.stem;
    const mid = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2] as const;
    const d = [a[0] - b[0], a[1] - b[1], a[2] - b[2]] as const;
    const len = Math.hypot(d[0], d[1], d[2]) || 1;
    const cut = [mid[0] + (d[0] / len) * 2, mid[1] + (d[1] / len) * 2, mid[2] + (d[2] / len) * 2] as const;
    const scissors = rt.apply({ type: 'move_scissors', x: cut[0], y: cut[1], z: cut[2], mode: 'absolute' });
    const open = rt.apply({ type: 'open_scissors' });
    return {
      targetId: target.id,
      targetState: target.state,
      basket: { ok: basket.ok, message: basket.message },
      scissors: { ok: scissors.ok, message: scissors.message },
      open: open.ok,
    };
  });

  const result = await page.evaluate(async () => window.__tomato!.renderViews!(['top', 'front', 'side']));

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
    expect(setup).not.toBeNull();
    expect(result.json.targetTomatoId).toBe(setup!.targetId);
    expect(setup!.targetState).toBe('ripe');
    expect(setup!.basket.ok, setup!.basket.message).toBe(true);
    expect(setup!.scissors.ok, setup!.scissors.message).toBe(true);
    expect(setup!.open).toBe(true);
    expect(result.json.scissors.openingDeg).toBeGreaterThan(0);
    const totalVisible = result.json.tomatoes.reduce((s, t) => s + t.visibleIn.top + t.visibleIn.front + t.visibleIn.side, 0);
    expect(totalVisible).toBeGreaterThan(0); // la passe d'identifiants voit au moins une tomate quelque part
  }

  mkdirSync(shotsDir, { recursive: true });
  for (const img of result.images) {
    writeFileSync(resolve(shotsDir, `view-${img.camera}.png`), Buffer.from(img.pngBase64, 'base64'));
  }

  await page.getByTestId('refresh-views').click();
  await expect(page.locator('img[alt="vue front"]')).toBeVisible();
  // Preuve visuelle du panneau de droite : les trois vues côte à côte sous le bouton (critère VIS-12).
  await page.screenshot({ path: resolve(shotsDir, 'dashboard.png') });
  expect(errors).toEqual([]);
});
