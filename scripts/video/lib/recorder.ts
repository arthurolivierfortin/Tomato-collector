/** Enregistrement d'une prise : ouvre la page, joue le scénario, écrit la vidéo et les marqueurs. */
import { mkdir, rename, rm, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import type { Page } from 'playwright';
import { firstPaintEpochMs, measureRafFps, openCapturePage, webglRenderer } from './browser';
import type { ScriptEntry } from './episodes';
import { createMarkerLog, type MarkerLog, type TakeMarkers } from './markers';
import { scenarioMarkers, type Scenario } from './scenario';
import { runStep } from './steps';
import { startTerminalCapture, type TerminalCapture } from './terminal';

export interface RecordOptions {
  readonly scenario: Scenario;
  readonly take: string;
  readonly pageUrl: string;
  readonly apiUrl: string;
  readonly outDir: string;
  readonly episode: readonly ScriptEntry[];
  /** Titre de la fenêtre de terminal à filmer en parallèle (`--terminal`), '' pour n'en filmer aucune. */
  readonly terminalTitle: string;
  readonly log: (line: string) => void;
}

export interface RecordResult {
  readonly markers: TakeMarkers;
  readonly videoPath: string;
  readonly markersPath: string;
  readonly renderer: string;
  readonly rafFps: number;
  readonly pageErrors: readonly string[];
  /** Message de l'étape qui a échoué ; la prise est écrite quand même. */
  readonly failure: string | null;
}

/** Cadence de la capture de terminal : celle du screencast Playwright, pour ne pas dériver. */
const TERMINAL_FPS = 25;

const READY_TIMEOUT_MS = 120_000;

/** Première ligne d'une erreur : Playwright en écrit vingt, une seule intéresse le journal de prise. */
function firstLine(e: unknown): string {
  const message = e instanceof Error ? e.message : String(e);
  return message.split('\n')[0] ?? message;
}

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

async function playSteps(page: Page, options: RecordOptions, markerLog: MarkerLog): Promise<string | null> {
  const { scenario, log } = options;
  const gates = new Set<string>();
  for (const [i, step] of scenario.steps.entries()) {
    const position = `${i + 1}/${scenario.steps.length}`;
    let label: string = step.kind;
    try {
      await runStep(page, step, {
        log: markerLog,
        gates,
        episode: options.episode,
        onStep: (text) => {
          label = text;
          log(`  ${position.padStart(6, ' ')} ${text}`);
        },
      });
    } catch (e) {
      // La prise garde de la valeur : on rend la main pour l'écrire, en nommant l'étape fautive.
      return `étape ${position} (${label}) : ${firstLine(e)}`;
    }
  }
  return null;
}

export async function record(options: RecordOptions): Promise<RecordResult> {
  const { scenario, take, outDir, log } = options;
  const outAbs = resolve(outDir);
  const rawDir = join(outAbs, `.raw-${take}`);
  await mkdir(rawDir, { recursive: true });
  const { browser, context, page, errors } = await openCapturePage(rawDir);
  // Instant t = 0 du fichier vidéo : Playwright démarre le screencast à la création de la page,
  // pas à sa première peinture. Caler l'origine sur la première peinture décalait tous les arrêts
  // sur image du temps de chargement — 0,9 s sur un Vite chaud, une dizaine de secondes à froid.
  const videoStartMs = Date.now();
  const markerLog = createMarkerLog(() => Date.now());
  markerLog.startAt(videoStartMs);
  // Le terminal démarre tout de suite : les deux vidéos partagent l'horloge de la prise, et le
  // montage sait à quelle seconde du terminal correspond chaque seconde de la page.
  let terminal: TerminalCapture | null = null;
  if (options.terminalTitle !== '') {
    terminal = startTerminalCapture(
      { title: options.terminalTitle, fps: TERMINAL_FPS, outPath: join(outAbs, `${take}.terminal.mkv`) },
      videoStartMs,
      (line) => log(`  [ffmpeg terminal] ${line}`),
    );
    log(`terminal : fenêtre « ${options.terminalTitle} » filmée dans ${terminal.outPath} (+${terminal.startMs} ms)`);
  }
  const startedAt = new Date().toISOString();
  let renderer = 'inconnu';
  let rafFps = 0;
  let firstPaintMs = 0;
  let failure: string | null = null;
  let markers: TakeMarkers;
  try {
    log(`page : ${options.pageUrl}`);
    await page.goto(options.pageUrl, { timeout: READY_TIMEOUT_MS });
    await waitForReady(page);
    // Gardée en trace, pas comme origine : elle dit ce que le spectateur voit avant la page.
    firstPaintMs = Math.max(0, Math.round((await firstPaintEpochMs(page)) - videoStartMs));
    log(`première peinture : ${(firstPaintMs / 1000).toFixed(1)} s après le début de la vidéo`);
    renderer = await webglRenderer(page);
    rafFps = await measureRafFps(page, 1500);
    log(`rendu : ${renderer} — ${rafFps} images/s (requestAnimationFrame)`);
    if (/swiftshader|software/i.test(renderer)) log('ATTENTION : rendu logiciel, la prise sera saccadée.');
    if (scenario.mode === 'live') await waitForServer(page, log);
    failure = await playSteps(page, options, markerLog);
  } catch (e) {
    failure = firstLine(e);
  } finally {
    await terminal?.stop();
    if (terminal !== null && terminal.failed()) log('ATTENTION : la capture du terminal s’est arrêtée (fenêtre introuvable ?) ; la prise n’aura pas d’incrustation.');
    markers = markerLog.snapshot({
      take,
      video: `${take}.webm`,
      mode: scenario.mode,
      startedAt,
      expected: scenarioMarkers(scenario),
      firstPaintMs,
      // Capture perdue (fenêtre introuvable, ffmpeg arrêté) : la prise n'annonce pas une piste
      // qui n'existe pas, et le montage se rabat sur les segments sans incrustation.
      ...(terminal === null || terminal.failed() ? {} : { terminal: { video: `${take}.terminal.mkv`, startMs: terminal.startMs } }),
      ...(failure === null ? {} : { failedStep: failure }),
    });
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
  return { markers, videoPath, markersPath, renderer, rafFps, pageErrors: errors, failure };
}
