/**
 * La fenêtre de l'agent headless visible, telle que le pilote de la prise la désigne et la lit.
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
 *
 * Tout ici est pur ; le processus de surveillance vit dans `windowWatcher.ts`.
 */
import type { ScreenRect } from './regionCapture';

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
  /**
   * Boucle dans le script : une ligne JSON par tour, jusqu'à ce que le pilote ferme le processus.
   *
   * Une sonde d'un coup coûte **530 ms** sur cette machine (mesuré), presque entièrement passée à
   * compiler le type `Add-Type`. Répétée toutes les 250 ms pendant l'attente de la fenêtre puis
   * pendant toute la prise, elle occupait plus de deux cœurs — au moment même où un navigateur
   * headless enregistre du 1920 × 1080 à 25 images par seconde. Un seul processus qui boucle
   * ramène ce coût à une compilation unique.
   */
  readonly watch?: boolean;
  readonly intervalMs?: number;
}

/** Arguments de `powershell` pour `window-rect.ps1`. */
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
    ...(options.watch === true ? ['-Watch'] : []),
    ...(options.intervalMs === undefined ? [] : ['-IntervalMs', String(options.intervalMs)]),
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

/** Les lignes complètes d'un morceau de sortie, et ce qu'il faut garder pour la lecture suivante. */
export function splitProbeLines(chunk: string): { lines: string[]; rest: string } {
  const parts = chunk.split(/\r?\n/);
  const rest = parts.pop() ?? '';
  return { lines: parts.filter((l) => l.trim() !== ''), rest };
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
