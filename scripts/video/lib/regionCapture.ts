/**
 * Capture d'une **zone de l'écran** par ffmpeg : c'est ainsi que la fenêtre de l'agent headless
 * visible est filmée.
 *
 * Pourquoi pas `-i title=<titre>` : Windows Terminal se rend en DirectX, et un `BitBlt` sur le
 * contexte de sa fenêtre ne rend que du noir — mesuré sur cette machine (ffmpeg 9, 2026-09-21 :
 * fenêtre trouvée, 75 images capturées, toutes noires et identiques). Le bureau composé, lui,
 * porte la fenêtre telle qu'elle s'affiche. La contrepartie est qu'il ne faut rien poser
 * par-dessus pendant la prise.
 *
 * L'écran de cette machine est à 250 % : `GetWindowRect` d'un processus conscient du DPI et
 * `gdigrab` parlent tous deux en pixels physiques, donc les deux se recoupent sans conversion.
 */
import { startFfmpegCapture, type TerminalCapture } from './terminal';

/** Rectangle de l'écran, en **pixels physiques** : c'est l'unité de `gdigrab -i desktop`. */
export interface ScreenRect {
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
}

/**
 * Rectangle rogné de `inset` pixels sur ses quatre côtés : de quoi retirer la bordure de
 * redimensionnement de Windows autour de la fenêtre filmée, sans toucher au contenu.
 */
export function insetRect(rect: ScreenRect, inset: number): ScreenRect {
  const w = rect.w - 2 * inset;
  const h = rect.h - 2 * inset;
  if (w <= 0 || h <= 0) throw new Error(`retrait de ${inset} px trop grand pour une fenêtre de ${rect.w}×${rect.h}`);
  return { x: rect.x + inset, y: rect.y + inset, w, h };
}

export interface RegionCaptureOptions {
  readonly region: ScreenRect;
  readonly fps: number;
  readonly outPath: string;
  /** Largeur maximale du fichier produit ; au-delà, la capture est réduite avant encodage. */
  readonly maxWidth?: number;
}

/** Arguments ffmpeg d'une capture de zone d'écran. */
export function gdigrabRegionArgs({ region, fps, outPath, maxWidth }: RegionCaptureOptions): string[] {
  // `yuv420p` exige des dimensions paires ; la zone d'une fenêtre est souvent impaire d'un pixel.
  const scale =
    maxWidth !== undefined && region.w > maxWidth ? `scale=${maxWidth}:-2` : 'scale=trunc(iw/2)*2:trunc(ih/2)*2';
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
    '-offset_x',
    String(region.x),
    '-offset_y',
    String(region.y),
    '-video_size',
    `${region.w}x${region.h}`,
    '-i',
    'desktop',
    '-vf',
    scale,
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
 * Lance la capture de la zone. Même horloge que la prise du dashboard : `videoStartMs` est
 * l'origine, et le décalage écrit dans les marqueurs dit à quelle seconde du terminal correspond
 * chaque seconde de la page.
 */
export function startRegionCapture(
  options: RegionCaptureOptions,
  videoStartMs: number,
  onError: (line: string) => void,
): TerminalCapture {
  return startFfmpegCapture(gdigrabRegionArgs(options), options.outPath, videoStartMs, onError);
}
