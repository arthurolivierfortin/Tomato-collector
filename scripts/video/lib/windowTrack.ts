/**
 * La piste « fenêtre de l'agent » d'une prise : attendre la fenêtre, la filmer, la refermer.
 *
 * Sortie de `recorder.ts`, qui n'a pas à connaître le détail de tout ça : il ouvre la piste au
 * début de la prise et la ferme à la fin.
 *
 * Le pilote **n'ouvre pas** cette fenêtre et n'y écrit jamais rien : c'est le serveur, en mode
 * `TOMATO_AGENT=visible`, qui la lance au réveil de l'agent.
 */
import { execFile } from 'node:child_process';
import { insetRect, startRegionCapture } from './regionCapture';
import type { TerminalCapture } from './terminal';
import { windowProbeArgs } from './windowRect';
import { createWindowWatcher } from './windowWatcher';

export interface WindowTrackOptions {
  /** Chemin de `scripts/video/window-rect.ps1`. */
  readonly script: string;
  /** Titre posé par le serveur sur la fenêtre (`TOMATO_VISIBLE_TITLE`). */
  readonly title: string;
  readonly fps: number;
  readonly outPath: string;
  /** Largeur maximale du fichier produit ; au-delà, la capture est réduite avant encodage. */
  readonly maxWidth: number;
  /** Pixels rognés sur les quatre bords de la fenêtre (bordure de Windows). */
  readonly inset: number;
  /** Origine de l'horloge de la prise : les marqueurs et la capture la partagent. */
  readonly videoStartMs: number;
  readonly timeoutMs: number;
  readonly intervalMs: number;
  readonly log: (line: string) => void;
}

export interface WindowTrack {
  /** La capture en cours, ou `null` tant que la fenêtre n'a pas été trouvée. */
  capture(): TerminalCapture | null;
  /** Arrête la surveillance et la capture, puis referme la fenêtre. */
  finish(): Promise<void>;
}

/** Referme la fenêtre. Un seul appel, à la toute fin : le coût d'un `Add-Type` n'y pèse rien. */
function closeWindow(script: string, title: string, handle: number): Promise<void> {
  return new Promise<void>((done) => {
    execFile('powershell.exe', windowProbeArgs(script, title, { close: true, handle }), { windowsHide: true }, () => done());
  });
}

/**
 * Ouvre la piste. `cancelled` dit que la prise est finie : l'attente rend alors la main tout de
 * suite au lieu d'épuiser son délai.
 */
export function startWindowTrack(options: WindowTrackOptions, cancelled: () => boolean): WindowTrack {
  const watcher = createWindowWatcher({
    script: options.script,
    title: options.title,
    intervalMs: options.intervalMs,
    log: options.log,
  });
  let capture: TerminalCapture | null = null;
  let handle: number | null = null;

  const started = (async (): Promise<void> => {
    const found = await watcher.whenFound(options.timeoutMs, cancelled);
    if (found === null) return;
    handle = found.handle;
    const region = insetRect(found.rect, options.inset);
    capture = startRegionCapture(
      { region, fps: options.fps, outPath: options.outPath, maxWidth: options.maxWidth },
      options.videoStartMs,
      (line) => options.log(`  [ffmpeg terminal] ${line}`),
    );
    options.log(
      `terminal : fenêtre « ${options.title} » à ${region.x},${region.y} (${region.w}×${region.h} px), ` +
        `filmée dans ${options.outPath} (+${capture.startMs} ms)`,
    );
  })();

  return {
    capture: () => capture,
    async finish() {
      await started;
      watcher.stop();
      await capture?.stop();
      // La fenêtre de l'agent reste ouverte tant que la prise dure (`-NoExit`) ; c'est ici qu'elle
      // se referme, une fois la dernière image écrite.
      if (handle !== null) await closeWindow(options.script, options.title, handle);
    },
  };
}
