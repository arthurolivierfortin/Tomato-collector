/**
 * Capture du terminal filmé en parallèle d'une prise (issue #35).
 *
 * Sans terminal à l'image, un spectateur peut croire que la session de l'agent est une mise en
 * scène du dashboard. Deux façons de le filmer :
 *
 * - **`page`, le défaut.** Le serveur recopie son flux dans un fichier (`TOMATO_LOG_FILE`), un
 *   petit serveur local sert une page qui suit ce fichier, et Playwright la filme en headless
 *   comme il filme le dashboard. C'est la sortie réelle du processus, affichée ligne à ligne ; rien
 *   ne dépend du bureau Windows, donc ça marche depuis n'importe quelle session, y compris sans
 *   écran.
 * - **`gdigrab`.** ffmpeg filme une vraie fenêtre de console par son titre. Gardé en option pour
 *   qui veut la vraie fenêtre à l'image, mais il exige une fenêtre **visible sur le bureau
 *   interactif** : une session non interactive n'en a pas, et la capture échoue toujours.
 */
import { spawn, type ChildProcess } from 'node:child_process';
import type { Browser } from 'playwright';
import { openTerminalPage } from './browser';
import { startTerminalServer, type TerminalServer } from './termServer';

/** Comment filmer le terminal : la page qui suit le journal, une fenêtre de console, ou rien. */
export type TerminalMode = 'page' | 'gdigrab' | 'off';

export function parseTerminalMode(raw: string): TerminalMode {
  if (raw === '' || raw === 'off') return 'off';
  if (raw === 'page' || raw === 'gdigrab') return raw;
  throw new Error(`--terminal : « page », « gdigrab » ou « off », reçu « ${raw} »`);
}

export interface GdigrabOptions {
  /** Titre exact de la fenêtre à filmer ; `terminal.ps1` le pose sur la console du serveur. */
  readonly title: string;
  readonly fps: number;
  readonly outPath: string;
}

/**
 * Arguments ffmpeg d'une capture de fenêtre. `gdigrab` rend la taille client de la fenêtre, souvent
 * impaire d'un pixel : `yuv420p` exige des dimensions paires, d'où le `scale=trunc(…/2)*2`.
 * `ultrafast` : l'encodage tourne pendant la prise, il ne doit voler ni CPU ni image.
 */
export function gdigrabArgs({ title, fps, outPath }: GdigrabOptions): string[] {
  return [
    '-hide_banner',
    '-loglevel',
    'error',
    '-f',
    'gdigrab',
    '-framerate',
    String(fps),
    '-draw_mouse',
    '0',
    '-i',
    `title=${title}`,
    '-vf',
    'scale=trunc(iw/2)*2:trunc(ih/2)*2',
    '-c:v',
    'libx264',
    '-preset',
    'ultrafast',
    '-pix_fmt',
    'yuv420p',
    '-y',
    outPath,
  ];
}

/**
 * Instant correspondant dans la vidéo du terminal, ou `null` quand la capture n'avait pas encore
 * commencé : le montage n'incruste alors rien plutôt que de montrer une image noire.
 */
export function terminalOffsetS(takeS: number, terminalStartMs: number): number | null {
  const s = takeS - terminalStartMs / 1000;
  return s < 0 ? null : s;
}

export interface TerminalCapture {
  /** Nom du fichier produit, relatif au dossier des prises. */
  readonly video: string;
  /** Décalage de la capture par rapport au t = 0 de la vidéo de la prise, en millisecondes. */
  readonly startMs: number;
  /**
   * `true` quand ffmpeg s'est arrêté tout seul : fenêtre au titre introuvable, fermée en cours de
   * route… La prise reste valable, mais elle n'a pas de piste terminal et ne doit pas en annoncer une.
   */
  failed(): boolean;
  stop(): Promise<void>;
}

/** Laps laissé à ffmpeg pour fermer proprement le conteneur après le « q ». */
const STOP_GRACE_MS = 4000;

function waitExit(child: ChildProcess, graceMs: number): Promise<void> {
  return new Promise<void>((done) => {
    const timer = setTimeout(() => {
      child.kill('SIGKILL');
      done();
    }, graceMs);
    child.once('exit', () => {
      clearTimeout(timer);
      done();
    });
  });
}

/**
 * Lance la capture et rend de quoi l'arrêter. `videoStartMs` est l'origine de la prise : le
 * décalage écrit dans les marqueurs met les deux vidéos sur la même horloge.
 */
export function startTerminalCapture(
  options: GdigrabOptions,
  videoStartMs: number,
  onError: (line: string) => void,
): TerminalCapture {
  const child = spawn('ffmpeg', gdigrabArgs(options), { stdio: ['pipe', 'ignore', 'pipe'] });
  const startMs = Date.now() - videoStartMs;
  child.stderr?.on('data', (d: Buffer) => {
    const line = d.toString('utf8').trim();
    if (line !== '') onError(line);
  });
  let stopped = false;
  let died = false;
  child.once('exit', () => {
    if (!stopped) died = true;
  });
  child.once('error', () => {
    died = true;
  });
  return {
    video: options.outPath,
    startMs,
    failed: () => died,
    async stop() {
      if (stopped) return;
      stopped = true;
      // « q » sur l'entrée standard : ffmpeg ferme l'index du conteneur, un SIGKILL le laisserait cassé.
      child.stdin?.write('q');
      child.stdin?.end();
      await waitExit(child, STOP_GRACE_MS);
    },
  };
}

/**
 * Capture par la page : on ouvre le serveur local qui suit le journal, puis une seconde page
 * headless dans le même navigateur. Le décalage est mesuré à la création de la page, comme pour
 * la prise principale : les deux vidéos partagent l'horloge de la prise.
 */
export async function startPageCapture(
  browser: Browser,
  logPath: string,
  videoDir: string,
  videoStartMs: number,
  log: (line: string) => void,
): Promise<TerminalCapture & { videoPath(): Promise<string>; }> {
  const server: TerminalServer = await startTerminalServer(logPath);
  const { context, page } = await openTerminalPage(browser, videoDir);
  const startMs = Date.now() - videoStartMs;
  log(`terminal : page ${server.url} suivant ${logPath} (+${startMs} ms)`);
  await page.goto(server.url, { timeout: 30_000 });
  let stopped = false;
  return {
    video: 'page',
    startMs,
    failed: () => false,
    async stop() {
      if (stopped) return;
      stopped = true;
      await context.close();
      await server.close();
    },
    async videoPath() {
      const video = page.video();
      if (video === null) throw new Error('aucune vidéo de terminal : recordVideo absent du contexte');
      return video.path();
    },
  };
}
