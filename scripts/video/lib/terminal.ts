/**
 * Capture d'une **vraie fenêtre de terminal** pendant une prise (issue #35).
 *
 * Sans terminal à l'image, un spectateur peut croire que la session de l'agent est une mise en
 * scène du dashboard. On filme donc, en parallèle de la page, la console qui fait tourner le
 * serveur avec `TOMATO_LOG_STREAM=on` : démarrage (« prêt … agent on (claude-opus-5) »), réveil,
 * puis le flux du SDK ligne à ligne.
 *
 * C'est la seule capture d'écran du pipeline, et elle est volontairement petite : `gdigrab` exige
 * une fenêtre visible, mais une console de 960×600 tient largement dans un écran de 1536×960. La
 * page, elle, reste en headless 1920×1080 (voir `browser.ts`).
 */
import { spawn, type ChildProcess } from 'node:child_process';

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
  readonly outPath: string;
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
    outPath: options.outPath,
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
