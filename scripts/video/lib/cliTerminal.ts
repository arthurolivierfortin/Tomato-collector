/**
 * La fenêtre de terminal où tourne le **vrai Claude Code interactif** pendant une prise
 * `--agent cli`, et la poignée de main qui la met sur l'horloge de la prise.
 *
 * Le pilote ne tape rien dans cette fenêtre : il l'ouvre, `claude` y démarre avec le message de
 * réveil passé en argument, et tout ce qui s'y affiche ensuite est l'interface du CLI. La capture
 * est une capture d'écran de cette fenêtre — aucune ligne n'est reformatée par nous.
 *
 * `claude-window.ps1` est le seul chemin, automatique ou manuel : il pose le titre, la taille et la
 * position, écrit le rectangle de la fenêtre dans `RectFile`, efface l'écran, puis lance `claude`
 * avec les arguments du fichier JSON. Le pilote attend `RectFile`, puis démarre ffmpeg sur cette
 * zone. Quand `Start-Process` ne donne pas de fenêtre visible, le propriétaire lance exactement la
 * même ligne à la main et la suite ne change pas.
 */
import { shellArg } from './claudeCli';
import type { ScreenRect } from './terminal';

export interface WindowParams {
  /** Chemin de `scripts/video/claude-window.ps1`. */
  readonly script: string;
  /** Titre posé sur la fenêtre, le temps que le pilote la trouve. */
  readonly title: string;
  readonly cols: number;
  readonly rows: number;
  /** Coin haut gauche voulu, en pixels physiques de l'écran. */
  readonly x: number;
  readonly y: number;
  /** Fichier JSON des arguments de `claude` (un tableau de chaînes). */
  readonly argsFile: string;
  /** Fichier JSON que la fenêtre écrit avec son rectangle, une fois placée. */
  readonly rectFile: string;
}

/** Arguments de `powershell` pour ouvrir la fenêtre ; même liste en automatique et à la main. */
export function windowLaunchArgs(p: WindowParams): string[] {
  return [
    '-NoProfile',
    '-NoExit',
    '-ExecutionPolicy',
    'Bypass',
    '-File',
    p.script,
    '-Title',
    p.title,
    '-Cols',
    String(p.cols),
    '-Rows',
    String(p.rows),
    '-X',
    String(p.x),
    '-Y',
    String(p.y),
    '-ArgsFile',
    p.argsFile,
    '-RectFile',
    p.rectFile,
  ];
}

/** La même commande, en une ligne collable dans un terminal. */
export function windowLaunchLine(p: WindowParams): string {
  return ['powershell', ...windowLaunchArgs(p).map(shellArg)].join(' ');
}

function isRecord(x: unknown): x is Record<string, unknown> {
  return typeof x === 'object' && x !== null;
}

/**
 * Rectangle rendu par la fenêtre. Tout ce qui n'est pas quatre nombres avec une surface non nulle
 * est refusé : mieux vaut une prise sans incrustation qu'une capture d'un morceau de bureau.
 */
export function parseWindowRect(x: unknown): ScreenRect | null {
  if (!isRecord(x)) return null;
  const { x: left, y: top, w, h } = x;
  if (typeof left !== 'number' || typeof top !== 'number' || typeof w !== 'number' || typeof h !== 'number') return null;
  if (w <= 0 || h <= 0) return null;
  return { x: left, y: top, w, h };
}

/**
 * Ce que `record.ts` affiche quand la fenêtre ne s'est pas ouverte toute seule : la ligne exacte,
 * ce que le pilote attend, et la seule règle de la prise. La commande `claude` construite est
 * montrée aussi, pour que le propriétaire voie sur quoi la session va se brancher.
 */
export function manualLaunchNotice(p: WindowParams, commandLine: string): string {
  return [
    '',
    'La fenêtre de terminal ne s’est pas ouverte toute seule. Ouvre-la à la main, dans Windows Terminal :',
    '',
    `    ${windowLaunchLine(p)}`,
    '',
    'Elle pose son titre, se place, efface son écran, puis lance exactement :',
    '',
    `    ${commandLine}`,
    '',
    `Le pilote attend le fichier ${p.rectFile}, écrit par la fenêtre dès qu’elle est placée, puis la filme.`,
    'Pendant toute la prise : ne rien poser par-dessus la fenêtre, ne pas la réduire, ne pas y taper.',
    '',
  ].join('\n');
}
