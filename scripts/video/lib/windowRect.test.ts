import { describe, expect, it } from 'vitest';
import { manualWindowNotice, parseWindowProbe, splitProbeLines, windowProbeArgs } from './windowRect';

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

  // Claude Code reprend le titre de la fenetre quelques secondes apres son demarrage : une fois
  // la fenetre trouvee, on ne la designe plus que par sa poignee.
  it('désigne la fenêtre par sa poignée dès qu’on la connaît, le titre pouvant changer', () => {
    const args = windowProbeArgs(SCRIPT, 'Claude Code headless', { handle: 2035468, topmost: true });
    expect(args[args.indexOf('-Handle') + 1]).toBe('2035468');
    expect(args).toContain('-Topmost');
  });

  /*
   * Mesure sur cette machine : une sonde d'un coup coute 530 ms, presque entierement passee a
   * compiler le type Add-Type. A 250 ms d'intervalle pendant l'attente de la fenetre puis toute
   * la prise, les sondes se chevauchaient et occupaient plus de deux coeurs — pendant qu'un
   * navigateur headless enregistre 1920x1080 a 25 img/s. Un seul processus, qui boucle a
   * l'interieur, ramene ce cout a une compilation unique.
   */
  it('sait boucler dans un seul processus, une ligne par tour', () => {
    const args = windowProbeArgs(SCRIPT, 'T', { watch: true, intervalMs: 250, topmost: true });
    expect(args).toContain('-Watch');
    expect(args[args.indexOf('-IntervalMs') + 1]).toBe('250');
  });
});

describe('splitProbeLines', () => {
  it('rend les lignes complètes et garde le reste pour la lecture suivante', () => {
    expect(splitProbeLines('{"a":1}\n{"b":2}\n')).toEqual({ lines: ['{"a":1}', '{"b":2}'], rest: '' });
  });

  it('garde une ligne coupée en deux', () => {
    expect(splitProbeLines('{"a":1}\n{"b"')).toEqual({ lines: ['{"a":1}'], rest: '{"b"' });
  });

  it('accepte les fins de ligne de Windows et ignore les lignes vides', () => {
    expect(splitProbeLines('{"a":1}\r\n\r\n').lines).toEqual(['{"a":1}']);
  });
});

describe('splitProbeLines, ancien reste', () => {
  it('recolle le reste de la lecture précédente', () => {
    const first = splitProbeLines('{"a"');
    expect(splitProbeLines(`${first.rest}:1}\n`).lines).toEqual(['{"a":1}']);
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
