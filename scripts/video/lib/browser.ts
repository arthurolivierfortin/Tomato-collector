/**
 * Ouverture du navigateur de prise de vue.
 *
 * Choix (mesuré, voir README) : Chromium **headless** (le nouveau headless, `channel: 'chromium'`),
 * pas headed. L'écran de la machine fait 1536×960 points logiques : une fenêtre headed de
 * 1920×1080 déborde et Windows la rogne. En headless, le viewport n'a rien à voir avec l'écran et
 * le rendu reste matériel (ANGLE D3D11, vérifié par `webglRenderer`) : 1920×1080 natif, texte net.
 */
import { chromium, type Browser, type BrowserContext, type Page } from 'playwright';

export const CAPTURE_WIDTH = 1920;
export const CAPTURE_HEIGHT = 1080;

/** Rendu matériel : ANGLE sur D3D11, liste noire GPU ignorée, vsync coupé pour ne pas brider la page. */
const GPU_ARGS = [
  '--use-angle=d3d11',
  '--enable-gpu-rasterization',
  '--ignore-gpu-blocklist',
  '--enable-webgl',
  '--force_high_performance_gpu',
  '--disable-gpu-vsync',
  '--hide-scrollbars',
  '--mute-audio',
];

/**
 * Taille de la page « terminal » filmée en parallèle : 960×600, soit exactement le rapport de la
 * vignette (480×300) et du demi-écran (912×570) du montage, donc aucune bande à l'incrustation.
 *
 * Elle est volontairement petite. Une page plus large tiendrait plus de lignes, mais réduite à une
 * vignette de 480 px son texte tomberait sous six pixels : illisible. À 960 px, la vignette est à
 * la moitié de l'échelle et le demi-écran est presque à l'échelle 1.
 */
export const TERMINAL_WIDTH = 960;
export const TERMINAL_HEIGHT = 600;

export interface OpenedPage {
  readonly browser: Browser;
  readonly context: BrowserContext;
  readonly page: Page;
  readonly errors: string[];
}

export async function openCapturePage(videoDir: string): Promise<OpenedPage> {
  const browser = await chromium.launch({ headless: true, channel: 'chromium', args: GPU_ARGS });
  const context = await browser.newContext({
    viewport: { width: CAPTURE_WIDTH, height: CAPTURE_HEIGHT },
    deviceScaleFactor: 1,
    recordVideo: { dir: videoDir, size: { width: CAPTURE_WIDTH, height: CAPTURE_HEIGHT } },
  });
  // `tsx` compile avec esbuild `keepNames`, qui enrobe les fonctions d'un appel à `__name`. Les
  // fonctions passées à `page.evaluate` sont sérialisées telles quelles : sans ce fantôme dans la
  // page, chaque évaluation échoue sur « __name is not defined ». Script brut, non recompilé.
  await context.addInitScript({ content: 'globalThis.__name = globalThis.__name || function (f) { return f; };' });
  const page = await context.newPage();
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  return { browser, context, page, errors };
}

/**
 * Seconde page filmée dans le même navigateur : le terminal. Elle vit dans son propre contexte,
 * avec sa propre taille et sa propre vidéo, et ne partage rien avec la page du dashboard.
 */
export async function openTerminalPage(browser: Browser, videoDir: string): Promise<{ context: BrowserContext; page: Page }> {
  const context = await browser.newContext({
    viewport: { width: TERMINAL_WIDTH, height: TERMINAL_HEIGHT },
    deviceScaleFactor: 1,
    recordVideo: { dir: videoDir, size: { width: TERMINAL_WIDTH, height: TERMINAL_HEIGHT } },
  });
  const page = await context.newPage();
  return { context, page };
}

/** Nom du rendu WebGL réel : « SwiftShader » ici voudrait dire rendu logiciel, donc prise saccadée. */
export async function webglRenderer(page: Page): Promise<string> {
  return page.evaluate(() => {
    const canvas = document.createElement('canvas');
    const gl = canvas.getContext('webgl2') ?? canvas.getContext('webgl');
    if (gl === null) return 'aucun contexte WebGL';
    const info = gl.getExtension('WEBGL_debug_renderer_info');
    return String(info === null ? gl.getParameter(gl.RENDERER) : gl.getParameter(info.UNMASKED_RENDERER_WEBGL));
  });
}

/** Cadence réelle de la page, mesurée sur `durationMs` de `requestAnimationFrame`. */
export async function measureRafFps(page: Page, durationMs: number): Promise<number> {
  return page.evaluate(
    (ms) =>
      new Promise<number>((resolve) => {
        let frames = 0;
        const t0 = performance.now();
        const tick = (): void => {
          frames += 1;
          const elapsed = performance.now() - t0;
          if (elapsed < ms) requestAnimationFrame(tick);
          else resolve(Math.round((frames * 1000) / elapsed));
        };
        requestAnimationFrame(tick);
      }),
    durationMs,
  );
}

/**
 * Instant de la première peinture de la page, en millisecondes epoch. Playwright n'écrit la vidéo
 * qu'à partir de la première image composée : c'est donc l'origine du fichier vidéo, et l'origine
 * qu'il faut donner aux marqueurs (sinon ils sont en retard de tout le temps de chargement).
 */
export async function firstPaintEpochMs(page: Page): Promise<number> {
  return page.evaluate(() => {
    const entries = performance.getEntriesByType('paint');
    const paint = entries.find((e) => e.name === 'first-paint') ?? entries[0];
    return performance.timeOrigin + (paint === undefined ? 0 : paint.startTime);
  });
}
