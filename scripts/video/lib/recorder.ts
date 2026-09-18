/** Enregistrement d'une prise : ouvre la page, joue le scénario, écrit la vidéo et les marqueurs. */
import { mkdir, rename, rm, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import type { Page } from 'playwright';
import { firstPaintEpochMs, measureRafFps, openCapturePage, webglRenderer } from './browser';
import type { ScriptEntry } from './episodes';
import { createMarkerLog, type TakeMarkers } from './markers';
import type { Scenario } from './scenario';
import { runStep } from './steps';

export interface RecordOptions {
  readonly scenario: Scenario;
  readonly take: string;
  readonly pageUrl: string;
  readonly wsUrl: string;
  readonly apiUrl: string;
  readonly outDir: string;
  readonly episode: readonly ScriptEntry[];
  readonly log: (line: string) => void;
}

export interface RecordResult {
  readonly markers: TakeMarkers;
  readonly videoPath: string;
  readonly markersPath: string;
  readonly renderer: string;
  readonly rafFps: number;
  readonly pageErrors: readonly string[];
}

const READY_TIMEOUT_MS = 120_000;

/** Attend que la scène soit montée ET que le pont de développement soit exposé (comme le test e2e). */
async function waitForReady(page: Page): Promise<void> {
  await page.getByTestId('spectator').waitFor({ state: 'visible', timeout: READY_TIMEOUT_MS });
  await page.waitForFunction(() => window.__tomato?.attachBridge !== undefined, undefined, { timeout: READY_TIMEOUT_MS });
}

/** En direct, la prise n'a de sens qu'une fois le serveur branché : on l'attend explicitement. */
async function waitForServer(page: Page, log: (line: string) => void): Promise<void> {
  log('mode direct : attente de « serveur connecté »…');
  await page.waitForFunction(
    () => (document.querySelector('[data-testid="connection"]')?.textContent ?? '').includes('serveur connecté'),
    undefined,
    { timeout: READY_TIMEOUT_MS },
  );
}

export async function record(options: RecordOptions): Promise<RecordResult> {
  const { scenario, take, outDir, log } = options;
  const outAbs = resolve(outDir);
  const rawDir = join(outAbs, `.raw-${take}`);
  await mkdir(rawDir, { recursive: true });
  const { browser, context, page, errors } = await openCapturePage(rawDir);
  const markerLog = createMarkerLog(() => Date.now());
  // Origine provisoire : remplacée par la première peinture dès que la page a chargé (voir plus bas).
  markerLog.start();
  const startedAt = new Date().toISOString();
  let renderer = 'inconnu';
  let rafFps = 0;
  let markers: TakeMarkers;
  try {
    log(`page : ${options.pageUrl}`);
    await page.goto(options.pageUrl, { timeout: READY_TIMEOUT_MS });
    await waitForReady(page);
    // Origine définitive : l'instant t = 0 du fichier vidéo.
    markerLog.startAt(await firstPaintEpochMs(page));
    renderer = await webglRenderer(page);
    rafFps = await measureRafFps(page, 1500);
    log(`rendu : ${renderer} — ${rafFps} images/s (requestAnimationFrame)`);
    if (/swiftshader|software/i.test(renderer)) log('ATTENTION : rendu logiciel, la prise sera saccadée.');
    if (scenario.mode === 'live') await waitForServer(page, log);
    for (const [i, step] of scenario.steps.entries()) {
      await runStep(page, step, {
        log: markerLog,
        episode: options.episode,
        onStep: (label) => log(`  ${String(i + 1).padStart(2, ' ')}/${scenario.steps.length} ${label}`),
      });
    }
  } finally {
    markers = markerLog.snapshot({ take, video: `${take}.webm`, mode: scenario.mode, startedAt });
    await context.close();
    await browser.close();
  }
  const video = page.video();
  if (video === null) throw new Error('aucune vidéo produite : recordVideo absent du contexte');
  const videoPath = join(outAbs, `${take}.webm`);
  await rm(videoPath, { force: true });
  await rename(await video.path(), videoPath);
  await rm(rawDir, { recursive: true, force: true });
  const markersPath = join(outAbs, `${take}.markers.json`);
  await writeFile(markersPath, `${JSON.stringify(markers, null, 2)}\n`, 'utf8');
  return { markers, videoPath, markersPath, renderer, rafFps, pageErrors: errors };
}
