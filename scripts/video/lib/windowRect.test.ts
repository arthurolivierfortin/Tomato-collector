import { describe, expect, it } from 'vitest';
import { manualWindowNotice, parseWindowProbe, windowProbeArgs } from './windowRect';

const SCRIPT = 'C:/Tomato-collector/scripts/video/window-rect.ps1';

describe('windowProbeArgs', () => {
  it('interroge le script par le titre exact de la fenêtre', () => {
    const args = windowProbeArgs(SCRIPT, 'Claude Code headless', {});
    expect(args).toContain('-NoProfile');
    expect(args[args.indexOf('-File') + 1]).toBe(SCRIPT);
    expect(args[args.indexOf('-Title') + 1]).toBe('Claude Code headless');
  });

  // La capture filme une zone de l'écran : tout ce qui passerait devant la fenêtre serait dans le
  // film. Mesuré pendant la mise au point : la fenêtre s'était ouverte derrière l'éditeur et la
  // capture a filmé l'éditeur.
  it('peut mettre la fenêtre au-dessus de tout, pour que rien ne la couvre pendant la prise', () => {
    expect(windowProbeArgs(SCRIPT, 'T', { topmost: true })).toContain('-Topmost');
    expect(windowProbeArgs(SCRIPT, 'T', {})).not.toContain('-Topmost');
  });

  it('sait aussi demander la fermeture de la fenêtre, à la fin de la prise', () => {
    expect(windowProbeArgs(SCRIPT, 'T', { close: true })).toContain('-Close');
  });
});

describe('parseWindowProbe', () => {
  it('lit le rectangle rendu par le script, en pixels physiques', () => {
    expect(parseWindowProbe('{"title":"T","handle":2163430,"x":33,"y":20,"w":2848,"h":1524}')).toEqual({
      rect: { x: 33, y: 20, w: 2848, h: 1524 },
      handle: 2163430,
    });
  });

  it('accepte la nomenclature que PowerShell peut mettre en tête de sa sortie', () => {
    expect(parseWindowProbe('\uFEFF{"handle":7,"x":0,"y":0,"w":100,"h":50}')?.handle).toBe(7);
  });

  it('rend null quand la fenêtre n’est pas là : le pilote attend, il ne filme pas le bureau', () => {
    expect(parseWindowProbe('{"handle":0,"x":0,"y":0,"w":0,"h":0,"error":"window not found by title"}')).toBeNull();
    expect(parseWindowProbe('')).toBeNull();
    expect(parseWindowProbe('pas du json')).toBeNull();
  });

  it('refuse une fenêtre de surface nulle : ffmpeg y capturerait zéro pixel', () => {
    expect(parseWindowProbe('{"handle":7,"x":0,"y":0,"w":0,"h":600}')).toBeNull();
  });
});

describe('manualWindowNotice', () => {
  const notice = manualWindowNotice('Claude Code headless', 120);

  it('nomme la fenêtre attendue et le temps laissé pour la faire apparaître', () => {
    expect(notice).toContain('Claude Code headless');
    expect(notice).toContain('120');
  });

  it('rappelle l’invite de confiance du dossier, que le propriétaire valide à la main', () => {
    expect(notice.toLowerCase()).toContain('confiance');
  });

  it('rappelle la seule règle de la prise : ne rien poser par-dessus la fenêtre', () => {
    expect(notice.toLowerCase()).toContain('par-dessus');
  });
});
