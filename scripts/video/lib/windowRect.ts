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
  const text = stdout.replace(/^﻿/, '').trim();
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
