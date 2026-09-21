/** Enregistrement d'une prise : ouvre la page, joue le scénario, écrit la vidéo et les marqueurs. */
import { mkdir, rename, rm, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { firstPaintEpochMs, measureRafFps, openCapturePage, webglRenderer } from './browser';
import type { ScriptEntry } from './episodes';
import { createMarkerLog, type TakeMarkers } from './markers';
import { scenarioMarkers, type Scenario } from './scenario';
import { startPageCapture, startTerminalCapture, type TerminalCapture, type TerminalMode } from './terminal';
import { firstLine, playSteps, READY_TIMEOUT_MS, waitForReady, waitForServer } from './play';
import { startWindowTrack, type WindowTrack } from './windowTrack';

export interface RecordOptions {
  readonly scenario: Scenario;
  readonly take: string;
  readonly pageUrl: string;
  readonly apiUrl: string;
  readonly outDir: string;
  readonly episode: readonly ScriptEntry[];
  /** Comment filmer le terminal : la page qui suit le journal, une fenêtre de console, ou rien. */
  readonly terminalMode: TerminalMode;
  /** Mode `page` : le fichier que le serveur écrit avec `TOMATO_LOG_FILE`. */
  readonly terminalLog: string;
  /** Modes `gdigrab` et `window` : le titre exact de la fenêtre à filmer. */
  readonly terminalWindow: string;
  /** Mode `window` : `scripts/video/window-rect.ps1`, qui trouve la fenêtre et rend son rectangle. */
  readonly windowScript: string;
  /** Mode `window` : pixels rognés sur les quatre bords de la fenêtre (bordure de Windows). */
  readonly terminalInset: number;
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

/**
 * Attente de la fenêtre de l'agent visible. Elle n'existe qu'au réveil de l'agent, donc après le
 * mûrissement et la détection ; et au premier lancement dans un dossier, Claude Code demande au
 * propriétaire s'il fait confiance à son contenu. Trois minutes, donc, largement.
 */
const WINDOW_TIMEOUT_MS = 180_000;
/**
 * Scrutation rapide : Claude Code **reprend le titre de la fenêtre** quelques secondes après son
 * démarrage (relevé : la fenêtre, titrée « Claude Code headless » par le script de lancement,
 * s'appelait « claude » à la fin de l'épisode). Le pilote doit donc la trouver pendant la fenêtre
 * de quelques secondes où le titre est encore le nôtre — et, une fois trouvée, il la suit par sa
 * position, plus par son titre.
 */
const WINDOW_POLL_MS = 250;

/**
 * Largeur maximale du fichier de capture. La fenêtre fait près de 2 900 pixels physiques de large
 * sur cet écran à 250 % ; encoder ça en direct volerait du CPU à la prise, et le montage ne la
 * montre jamais plus large que la moitié de l'image.
 */
const TERMINAL_MAX_WIDTH = 1600;

/** Première ligne d'une erreur : Playwright en écrit vingt, une seule intéresse le journal de prise. */
export async function record(options: RecordOptions): Promise<RecordResult> {
  const { scenario, take, outDir, log } = options;
  const outAbs = resolve(outDir);
  const rawDir = join(outAbs, `.raw-${take}`);
  // `.mkv` pour ffmpeg, `.webm` pour Playwright : le montage lit les deux sans rien savoir du mode.
  const terminalName = `${take}.terminal.${options.terminalMode === 'gdigrab' ? 'mkv' : options.terminalMode === 'window' ? 'mp4' : 'webm'}`;
  await mkdir(rawDir, { recursive: true });
  const { browser, context, page, errors } = await openCapturePage(rawDir);
  // Instant t = 0 du fichier vidéo : Playwright démarre le screencast à la création de la page,
  // pas à sa première peinture. Caler l'origine sur la première peinture décalait tous les arrêts
  // sur image du temps de chargement — 0,9 s sur un Vite chaud, une dizaine de secondes à froid.
  const videoStartMs = Date.now();
  const markerLog = createMarkerLog(() => Date.now());
  markerLog.startAt(videoStartMs);
  let terminal: TerminalCapture | null = null;
  let terminalVideo: (() => Promise<string>) | null = null;
  /** Mode `window` : la piste de la fenêtre de l'agent, ouverte au début et fermée à la fin. */
  let windowTrack: WindowTrack | null = null;
  let stepsDone = false;
  const startedAt = new Date().toISOString();
  let renderer = 'inconnu';
  let rafFps = 0;
  let firstPaintMs = 0;
  let failure: string | null = null;
  let markers: TakeMarkers;
  try {
    // Le terminal démarre tout de suite : les deux vidéos partagent l'horloge de la prise, et le
    // montage sait à quelle seconde du terminal correspond chaque seconde de la page. Ouvert dans
    // le `try` : un échec ici (fichier illisible, page qui ne charge pas) doit passer par le
    // `finally`, qui ferme le navigateur, plutôt que de le laisser tourner.
    if (options.terminalMode === 'gdigrab') {
      terminal = startTerminalCapture(
        { title: options.terminalWindow, fps: TERMINAL_FPS, outPath: join(outAbs, `${take}.terminal.mkv`) },
        videoStartMs,
        (line) => log(`  [ffmpeg terminal] ${line}`),
      );
      log(`terminal : fenêtre « ${options.terminalWindow} » filmée dans ${terminal.video} (+${terminal.startMs} ms)`);
    } else if (options.terminalMode === 'window') {
      // La fenetre n'existe pas encore : le serveur l'ouvre au reveil de l'agent. La piste
      // l'attend en tache de fond et demarre la capture a la seconde ou elle apparait, sur
      // l'horloge de la prise, comme les marqueurs.
      windowTrack = startWindowTrack(
        {
          script: options.windowScript,
          title: options.terminalWindow,
          fps: TERMINAL_FPS,
          outPath: join(outAbs, terminalName),
          maxWidth: TERMINAL_MAX_WIDTH,
          inset: options.terminalInset,
          videoStartMs,
          timeoutMs: WINDOW_TIMEOUT_MS,
          intervalMs: WINDOW_POLL_MS,
          log,
        },
        () => stepsDone,
      );
      log(`terminal : attente de la fenêtre « ${options.terminalWindow} » (ouverte par le serveur au réveil de l’agent).`);
    } else if (options.terminalMode === 'page') {
      const capture = await startPageCapture(browser, options.terminalLog, join(rawDir, 'terminal'), videoStartMs, log);
      terminal = capture;
      terminalVideo = () => capture.videoPath();
    }
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
    stepsDone = true;
  } catch (e) {
    stepsDone = true;
    failure = firstLine(e);
  } finally {
    stepsDone = true;
    // L'attente de la fenêtre est coupée par `stepsDone` : elle rend la main tout de suite, puis
    // la piste arrête sa capture et referme la fenêtre.
    terminal = terminal ?? windowTrack?.capture() ?? null;
    await windowTrack?.finish();
    terminal = terminal ?? windowTrack?.capture() ?? null;
    // Le contexte du terminal doit être fermé avant qu'on demande son fichier : Playwright n'écrit
    // l'index de la vidéo qu'à la fermeture.
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
      ...(terminal === null || terminal.failed()
        ? {}
        : {
            terminal: {
              video: terminalName,
              startMs: terminal.startMs,
              // `off` ne produit aucune piste : à ce point, le mode est forcément l'un des trois.
              source: options.terminalMode as Exclude<TerminalMode, 'off'>,
            },
          }),
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
  // Le terminal sort du même dossier brut : le sortir AVANT d'effacer ce dossier.
  if (terminalVideo !== null && terminal !== null && !terminal.failed()) {
    const to = join(outAbs, terminalName);
    await rm(to, { force: true });
    await rename(await terminalVideo(), to);
    log(`terminal : ${to}`);
  }
  await rm(rawDir, { recursive: true, force: true });
  const markersPath = join(outAbs, `${take}.markers.json`);
  await writeFile(markersPath, `${JSON.stringify(markers, null, 2)}\n`, 'utf8');
  return { markers, videoPath, markersPath, renderer, rafFps, pageErrors: errors, failure };
}
