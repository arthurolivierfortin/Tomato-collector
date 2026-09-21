/**
 * Le processus **unique** qui surveille la fenêtre de l'agent pendant toute la prise.
 *
 * Pourquoi un seul : une sonde lancée d'un coup coûte 530 ms sur cette machine (mesuré, 20 sondes
 * en 10,6 s), presque entièrement passée à compiler le type `Add-Type` de `window-rect.ps1`. À
 * 250 ms d'intervalle, les sondes se chevauchaient et occupaient plus de deux cœurs — pendant
 * qu'un navigateur headless enregistre du 1920 × 1080 à 25 images par seconde. Le script boucle
 * donc à l'intérieur et écrit une ligne JSON par tour ; la compilation n'a lieu qu'une fois.
 *
 * Ce processus fait aussi le travail de remise au premier plan : `wt.exe` applique `--pos` et
 * `--size` après coup, la fenêtre repasse derrière, et la capture est une capture d'**écran**.
 */
import { spawn, type ChildProcess } from 'node:child_process';
import { parseWindowProbe, splitProbeLines, windowProbeArgs, type WindowProbe } from './windowRect';

export interface WindowWatcherOptions {
  /** Chemin de `scripts/video/window-rect.ps1`. */
  readonly script: string;
  readonly title: string;
  /** Période de la boucle interne du script. */
  readonly intervalMs: number;
  readonly log?: (line: string) => void;
}

export interface WindowWatcher {
  /**
   * La fenêtre, dès qu'elle apparaît ; `null` si le délai passe ou si la prise s'arrête d'abord.
   * Le délai est long : au premier lancement dans un dossier, Claude Code demande au propriétaire
   * s'il fait confiance à son contenu, et c'est lui qui répond, à la main.
   */
  whenFound(timeoutMs: number, cancelled: () => boolean): Promise<WindowProbe | null>;
  /** Dernier rectangle connu, ou `null` tant que la fenêtre n'a pas été vue. */
  latest(): WindowProbe | null;
  stop(): void;
}

/** Période de scrutation du côté Node ; le script, lui, boucle tout seul. */
const CHECK_MS = 100;

export function createWindowWatcher(options: WindowWatcherOptions): WindowWatcher {
  const log = options.log ?? ((): void => undefined);
  const args = windowProbeArgs(options.script, options.title, {
    topmost: true,
    watch: true,
    intervalMs: options.intervalMs,
  });
  let child: ChildProcess | null = spawn('powershell.exe', args, { stdio: ['ignore', 'pipe', 'ignore'], windowsHide: true });
  let found: WindowProbe | null = null;
  let rest = '';

  child.stdout?.setEncoding('utf8');
  child.stdout?.on('data', (chunk: string) => {
    const split = splitProbeLines(rest + chunk);
    rest = split.rest;
    for (const line of split.lines) {
      const probe = parseWindowProbe(line);
      // Une fenêtre déjà trouvée n'est jamais « reperdue » : le script garde sa poignée, et une
      // ligne vide passagère ne doit pas effacer le rectangle sur lequel ffmpeg tourne déjà.
      if (probe !== null) found = probe;
    }
  });
  child.once('error', (e) => log(`fenêtre : surveillance impossible (${e.message})`));

  return {
    latest: () => found,
    async whenFound(timeoutMs, cancelled) {
      const deadline = Date.now() + timeoutMs;
      for (;;) {
        if (found !== null) return found;
        if (cancelled()) return null;
        if (Date.now() >= deadline) {
          log(`fenêtre « ${options.title} » toujours absente après ${Math.round(timeoutMs / 1000)} s : la prise continue sans incrustation.`);
          return null;
        }
        await new Promise((r) => setTimeout(r, CHECK_MS));
      }
    },
    stop() {
      child?.kill();
      child = null;
    },
  };
}
