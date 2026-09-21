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
 * - **`window`.** La zone d'écran où vit la fenêtre de l'agent headless visible : voir
 *   `regionCapture.ts`, qui porte les arguments ffmpeg et la géométrie.
 */
import { spawn, type ChildProcess } from 'node:child_process';
import type { Browser } from 'playwright';
import { openTerminalPage } from './browser';
import { startTerminalServer, type TerminalServer } from './termServer';

/**
 * Comment filmer le terminal : la page qui suit le journal, une fenêtre de console par son titre,
 * une **zone de l'écran** (la fenêtre où tourne Claude Code en interactif), ou rien.
 */
export type TerminalMode = 'page' | 'gdigrab' | 'window' | 'off';

export function parseTerminalMode(raw: string): TerminalMode {
  if (raw === '' || raw === 'off') return 'off';
  if (raw === 'page' || raw === 'gdigrab' || raw === 'window') return raw;
  throw new Error(`--terminal : « page », « gdigrab », « window » ou « off », reçu « ${raw} »`);
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

/** Où commence la vignette du terminal dans un sous-plan, et combien de temps elle se fait attendre. */
export interface TerminalPipStart {
  /** Instant de départ dans la vidéo du terminal. */
  readonly atS: number;
  /**
   * Retard, depuis le début du sous-plan, avant que la vignette apparaisse. Nul dès que la piste
   * existe déjà ; positif quand la fenêtre de l'agent s'ouvre en cours de plan.
   */
  readonly delayS: number;
}

/**
 * Instant correspondant dans la vidéo du terminal.
 *
 * La fenêtre de l'agent n'existe qu'au réveil : un sous-plan qui commence avant elle n'a rien à
 * incruster **au début**, mais il en a à incruster ensuite. La v3 jetait alors la vignette pour tout
 * le sous-plan — le segment « Detection, then the agent wakes up » durait 9,8 s et n'en montrait
 * aucune parce que la fenêtre s'ouvrait 1,8 s après son début. Le retard est donc rendu au lieu
 * d'un `null` : le montage pose la vignette à la seconde où la piste commence, en fondu d'entrée.
 */
export function terminalPipStart(takeS: number, terminalStartMs: number): TerminalPipStart {
  // Arrondi à la milliseconde : les deux horloges sont des millisecondes, et une soustraction de
  // flottants sortirait 1,8429999999999982 là où les marqueurs disent 1,843.
  const s = Math.round((takeS - terminalStartMs / 1000) * 1000) / 1000;
  return s >= 0 ? { atS: s, delayS: 0 } : { atS: 0, delayS: -s };
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
  return startFfmpegCapture(gdigrabArgs(options), options.outPath, videoStartMs, onError);
}

/** Lance ffmpeg, rend de quoi l'arrêter proprement. Partagé par les deux captures par fenêtre. */
export function startFfmpegCapture(
  args: readonly string[],
  outPath: string,
  videoStartMs: number,
  onError: (line: string) => void,
): TerminalCapture {
  const child = spawn('ffmpeg', [...args], { stdio: ['pipe', 'ignore', 'pipe'] });
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
    video: outPath,
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
