/**
 * Jeu d'évaluation du détecteur de maturité (issue #36).
 *
 * Rend N vues caméra BRUTES (800×800, sans contours ni annotations — exactement ce que reçoit le
 * détecteur) sur des plants tirés au hasard et des maturités variées, et écrit pour chacune ses boîtes
 * de vérité terrain, calculées à la génération par projection des tomates (jamais par un modèle).
 *
 * Format YOLO : `images/xxxx.png` et `labels/xxxx.txt` (`classe cx cy w h`, normalisés), plus
 * `dataset.yaml` et `manifest.json`. Classes : 0 = unripe, 1 = ripe (l'ordre du modèle exporté).
 *
 * Usage (serveur Vite déjà lancé, ou lancé par ce script) :
 *     npx tsx scripts/perception/generate-dataset.ts --count 100 --port 5319 --out data/perception/eval
 */
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { chromium, type Page } from 'playwright';
import { CLASS_NAMES, parseArgs, pickCamera, plan, toYoloLines, type SampleRecord } from './datasetPlan';
import './pageGlobals';

const ROOT = resolve(import.meta.dirname, '../..');
const LAUNCH_ARGS = ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'];

async function ready(page: Page): Promise<void> {
  await page.waitForFunction(() => window.__tomato?.sample !== undefined && window.__tomato?.renderViews !== undefined, null, { timeout: 60_000 });
}

/**
 * Prépare une scène : plant régénéré avec la graine **explicite** de la prise (sans elle, deux jeux
 * successifs rejouaient la même suite de plants et un jeu de contrôle ne prouvait rien), sim accélérée
 * ×10 pendant `settleMs` pour que le mûrissement naturel amène des fruits « turning » (orange) en cours
 * de rampe, puis `ripenCount` fruits mûris d'un coup.
 */
async function stage(page: Page, seed: number, ripenCount: number, settleMs: number): Promise<void> {
  await page.evaluate((plantSeed: number) => {
    const t = window.__tomato!;
    t.runtime.applyNow({ type: 'new_plant', seed: plantSeed });
    t.runtime.applyNow({ type: 'set_time_scale', scale: 10 });
  }, seed);
  await page.waitForTimeout(settleMs);
  await page.evaluate((k: number) => {
    const t = window.__tomato!;
    for (let i = 0; i < k; i++) t.runtime.applyNow({ type: 'ripen_next' });
  }, ripenCount);
  await page.waitForTimeout(120);
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const outDir = resolve(ROOT, args.out);
  rmSync(outDir, { recursive: true, force: true });
  mkdirSync(resolve(outDir, 'images'), { recursive: true });
  mkdirSync(resolve(outDir, 'labels'), { recursive: true });

  const browser = await chromium.launch({ args: LAUNCH_ARGS });
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  await page.goto(`http://localhost:${args.port}/`);
  await ready(page);

  const records: SampleRecord[] = [];
  for (const step of plan(args.count, args.seed)) {
    await stage(page, step.plantSeed, step.ripenCount, step.settleMs);
    const camera = pickCamera(step.index, args.camera);
    const sample = await page.evaluate(async (cam) => {
      // `renderViews` met `visibleIn` à jour (passe d'identifiants) : les fruits occultés ne sont pas étiquetés.
      await window.__tomato!.renderViews!([cam]);
      return window.__tomato!.sample!(cam);
    }, camera);
    if (sample === null) throw new Error('la page ne rend pas la scène');
    const name = String(step.index).padStart(4, '0');
    writeFileSync(resolve(outDir, 'images', `${name}.png`), Buffer.from(sample.pngBase64, 'base64'));
    writeFileSync(resolve(outDir, 'labels', `${name}.txt`), toYoloLines(sample.labels, sample.widthPx, sample.heightPx));
    records.push({ name, camera, plantSeed: step.plantSeed, ripe: sample.labels.filter((l) => l.label === 'ripe').length, unripe: sample.labels.filter((l) => l.label === 'unripe').length });
    if ((step.index + 1) % 10 === 0) console.log(`${step.index + 1}/${args.count} images`);
  }
  await browser.close();

  writeFileSync(resolve(outDir, 'dataset.yaml'), `path: .\nval: images\nnames:\n${CLASS_NAMES.map((n, i) => `  ${i}: ${n}`).join('\n')}\n`);
  writeFileSync(resolve(outDir, 'manifest.json'), `${JSON.stringify({ count: records.length, seed: args.seed, records }, null, 2)}\n`);
  const ripe = records.reduce((s, r) => s + r.ripe, 0);
  console.log(`${records.length} images, ${ripe} boîtes ripe, ${records.reduce((s, r) => s + r.unripe, 0)} boîtes unripe → ${outDir}`);
}

await main();
