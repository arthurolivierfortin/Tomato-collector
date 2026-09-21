/**
 * La fenêtre de l'agent headless visible, vue par le pilote de la prise.
 *
 * Le serveur (`TOMATO_AGENT=visible`) ouvre cette fenêtre au réveil de l'agent et y lance
 * `claude -p … --output-format stream-json`. Le pilote, lui, ne fait que deux choses : la
 * **trouver par son titre**, et la **filmer**. Il n'y écrit jamais rien.
 *
 * Filmer une zone de l'écran plutôt que la fenêtre par son titre n'est pas un choix de confort :
 * `ffmpeg -f gdigrab -i title=<titre>` trouve bien la fenêtre de Windows Terminal, mais n'en
 * ramène que du **noir** — elle se dessine en DirectX, et un `BitBlt` sur son contexte ne rend
 * rien (mesuré : 75 images capturées, toutes noires et identiques). Le bureau composé, lui, la
 * porte telle qu'elle s'affiche.
 *
 * Deux conséquences, toutes deux prises en charge : la fenêtre est mise **au-dessus de tout**
 * (`-Topmost`), et le rectangle est demandé en **pixels physiques** — l'écran de la machine est à
 * 250 %, et `gdigrab` ne connaît que les pixels physiques.
 */
import type { ScreenRect } from './terminal';

export interface WindowProbeOptions {
  /** Met la fenêtre au-dessus de toutes les autres, pour que rien ne la couvre pendant la prise. */
  readonly topmost?: boolean;
  /** Ferme la fenêtre au lieu de rendre son rectangle (fin de prise). */
  readonly close?: boolean;
  /**
   * Poignée connue de la fenêtre. Dès qu'on la tient, on ne la cherche plus par son titre :
   * Claude Code reprend celui de la fenêtre quelques secondes après son démarrage.
   */
  readonly handle?: number;
}

/** Arguments de `powershell` pour interroger `window-rect.ps1`. */
export function windowProbeArgs(script: string, title: string, options: WindowProbeOptions): string[] {
  return [
    '-NoProfile',
    '-ExecutionPolicy',
    'Bypass',
    '-File',
    script,
    '-Title',
    title,
    ...(options.handle === undefined ? [] : ['-Handle', String(options.handle)]),
    ...(options.topmost === true ? ['-Topmost'] : []),
    ...(options.close === true ? ['-Close'] : []),
  ];
}

export interface WindowProbe {
  readonly rect: ScreenRect;
  /** Poignée de la fenêtre, telle que Windows la connaît ; sert à la refermer. */
  readonly handle: number;
}

function isRecord(x: unknown): x is Record<string, unknown> {
  return typeof x === 'object' && x !== null;
}

/**
 * Ce que le script a rendu. Tout ce qui n'est pas une fenêtre trouvée avec une surface non nulle
 * rend `null` : mieux vaut une prise sans incrustation qu'une capture d'un morceau de bureau.
 */
export function parseWindowProbe(stdout: string): WindowProbe | null {
  const text = stdout.replace(/^\uFEFF/, '').trim();
  if (text === '') return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return null;
  }
  if (!isRecord(parsed)) return null;
  const { handle, x, y, w, h } = parsed;
  if (typeof handle !== 'number' || handle === 0) return null;
  if (typeof x !== 'number' || typeof y !== 'number' || typeof w !== 'number' || typeof h !== 'number') return null;
  if (w <= 0 || h <= 0) return null;
  return { rect: { x, y, w, h }, handle };
}

/** Interroge le script une fois. Jamais d'exception : une fenêtre absente est un `null`. */
export async function probeWindow(script: string, title: string, options: WindowProbeOptions = {}): Promise<WindowProbe | null> {
  const { execFile } = await import('node:child_process');
  return new Promise<WindowProbe | null>((done) => {
    execFile('powershell.exe', windowProbeArgs(script, title, options), { windowsHide: true }, (error, stdout) => {
      done(error !== null ? null : parseWindowProbe(stdout));
    });
  });
}

export interface WaitForWindowOptions {
  readonly timeoutMs: number;
  readonly pollMs: number;
  /** Arrête l'attente avant la fin du délai : la prise s'est terminée sans que la fenêtre vienne. */
  readonly cancelled?: () => boolean;
  readonly log?: (line: string) => void;
}

/**
 * Attend que la fenêtre apparaisse. Le délai est volontairement long : au premier lancement dans
 * un dossier, Claude Code demande s'il faut faire confiance à son contenu, et c'est le
 * propriétaire qui répond, à la main, pendant que le pilote patiente.
 */
export async function waitForWindow(script: string, title: string, options: WaitForWindowOptions): Promise<WindowProbe | null> {
  const deadline = Date.now() + options.timeoutMs;
  for (;;) {
    if (options.cancelled?.() === true) return null;
    const found = await probeWindow(script, title, { topmost: true });
    if (found !== null) return found;
    if (Date.now() >= deadline) {
      options.log?.(`fenêtre « ${title} » toujours absente après ${Math.round(options.timeoutMs / 1000)} s : la prise continue sans incrustation.`);
      return null;
    }
    await new Promise((r) => setTimeout(r, options.pollMs));
  }
}

/** Referme la fenêtre à la fin de la prise. Le serveur, lui, l'a laissée ouverte (`-NoExit`). */
export async function closeWindow(script: string, title: string, handle: number): Promise<void> {
  await probeWindow(script, title, { close: true, handle });
}

/**
 * Remet la fenêtre au-dessus de tout, à intervalle régulier, tant que la prise dure.
 *
 * Une seule mise au premier plan ne tient pas : `wt.exe` applique `--pos` et `--size` après coup,
 * et la fenêtre repasse derrière (mesuré : la capture filmait l'éditeur de code). Comme la capture
 * est une capture d'**écran**, une fenêtre passée devant entrerait dans le film. Le rappel se fait
 * par la poignée, le titre ayant pu changer entre-temps.
 */
export function keepOnTop(script: string, title: string, handle: number, everyMs: number): { stop(): void } {
  const timer = setInterval(() => {
    void probeWindow(script, title, { topmost: true, handle });
  }, everyMs);
  timer.unref?.();
  return { stop: () => clearInterval(timer) };
}

/**
 * Ce que `record.ts` affiche pendant qu'il attend la fenêtre. Elle peut tarder : au premier
 * lancement dans un dossier, Claude Code demande s'il faut faire confiance à son contenu, et
 * c'est le propriétaire qui répond — d'où une attente longue et un message qui le dit.
 */
export function manualWindowNotice(title: string, timeoutS: number): string {
  return [
    '',
    `En attente de la fenêtre « ${title} », ouverte par le serveur au réveil de l’agent.`,
    `Le pilote patiente jusqu’à ${timeoutS} s, puis filme la prise sans incrustation.`,
    '',
    'Si elle ne vient pas, ou si elle s’ouvre et attend :',
    '  - une invite de confiance du dossier (« Do you trust the files in this folder? ») se',
    '    valide à la main, dans la fenêtre. C’est la seule frappe permise de toute la prise ;',
    '  - le serveur doit tourner avec TOMATO_AGENT=visible ; sans cela, aucune fenêtre ne s’ouvre.',
    '',
    'Pendant toute la prise : ne rien poser par-dessus la fenêtre, ne pas la réduire, ne pas y taper.',
    '',
  ].join('\n');
}
