/**
 * Vérification réelle du détecteur (issue #36) : ouvre la page, attend que le modèle ONNX soit chargé,
 * fait mûrir une tomate et contrôle que le réveil part **du modèle** — pas du repli HSV, pas d'un état
 * de la simulation. Écrit un rapport et une capture dans `data/shots/`.
 *
 * À lancer avec la sim sur le port choisi (et, pour voir la trace et le schéma bloc, le serveur en
 * `TOMATO_AGENT=off`, la page pointée vers lui par `VITE_TOMATO_WS_URL`) :
 *     npx tsx scripts/perception/verify-live.ts --port 5319
 */
import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { chromium } from 'playwright';
import './pageGlobals';

const ROOT = resolve(import.meta.dirname, '../..');
const LAUNCH_ARGS = ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'];
const RIPEN_ATTEMPTS = 4;
const WAKE_TIMEOUT_MS = 30_000;

const flag = (name: string, fallback: number): number => {
  const i = process.argv.indexOf(name);
  const value = i >= 0 ? Number(process.argv[i + 1]) : NaN;
  return Number.isFinite(value) ? value : fallback;
};

async function main(): Promise<void> {
  const port = flag('--port', 5319);
  const browser = await chromium.launch({ args: LAUNCH_ARGS });
  // Jamais plus grand que l'écran de tournage : 1536×864 (issue #36).
  const page = await browser.newPage({ viewport: { width: 1536, height: 864 } });
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(`http://localhost:${port}/`);
  await page.waitForFunction(() => window.__tomatoPerception?.state().yoloReady === true, null, { timeout: 60_000 });

  await page.evaluate(() => {
    const p = window.__tomatoPerception!;
    p.events.length = 0;
    window.__tomato!.runtime.onEvent!((e) => {
      if (e.type === 'ripe_detected') p.events.push(e);
    });
  });
  await page.keyboard.press('p');

  let woke = false;
  for (let attempt = 0; attempt < RIPEN_ATTEMPTS && !woke; attempt++) {
    await page.evaluate(() => window.__tomato!.runtime.applyNow({ type: 'ripen_next' }));
    woke = await page
      .waitForFunction(() => window.__tomatoPerception!.events.length > 0, null, { timeout: WAKE_TIMEOUT_MS })
      .then(() => true, () => false);
  }

  const state = await page.evaluate(() => {
    const s = window.__tomatoPerception!.state();
    return {
      yoloReady: s.yoloReady,
      opencvReady: s.opencvReady,
      lastDetector: s.lastDetector,
      inferenceMs: Math.round(s.lastInferenceMs ?? 0),
      boxes: s.lastDetections.map((d) => ({ label: d.label, score: Number(d.score.toFixed(3)) })),
      gate: s.gate,
      events: window.__tomatoPerception!.events,
    };
  });
  const report = {
    woke,
    panel: await page.getByTestId('perception-detector').textContent(),
    statusBar: await page.getByTestId('detector').textContent(),
    connection: await page.getByTestId('connection').textContent(),
    ...state,
    errors,
  };
  await page.screenshot({ path: resolve(ROOT, 'data/shots/model-live.png') });
  await browser.close();
  writeFileSync(resolve(ROOT, 'data/shots/model-live.json'), `${JSON.stringify(report, null, 2)}\n`);
  console.log(JSON.stringify(report, null, 2));
  if (!woke || state.lastDetector !== 'yolo') throw new Error('le réveil n’est pas venu du modèle');
}

await main();
