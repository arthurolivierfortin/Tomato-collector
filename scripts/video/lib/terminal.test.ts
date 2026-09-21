import { describe, expect, it } from 'vitest';
import { gdigrabArgs, gdigrabRegionArgs, insetRect, parseTerminalMode, terminalOffsetS } from './terminal';

describe('gdigrabArgs', () => {
  it('capture une fenêtre par son titre, pas l’écran', () => {
    const args = gdigrabArgs({ title: 'Tomato server', fps: 25, outPath: 'C:/out/cycle.terminal.mkv' });
    expect(args.join(' ')).toContain('-f gdigrab');
    expect(args.join(' ')).toContain('-i title=Tomato server');
    expect(args.join(' ')).toContain('-framerate 25');
    expect(args[args.length - 1]).toBe('C:/out/cycle.terminal.mkv');
  });

  it('encode sans latence et en dimensions paires : gdigrab rend souvent une largeur impaire', () => {
    const args = gdigrabArgs({ title: 'T', fps: 25, outPath: 'o.mkv' }).join(' ');
    expect(args).toContain('-preset ultrafast');
    expect(args).toContain('scale=trunc(iw/2)*2:trunc(ih/2)*2');
    expect(args).toContain('-pix_fmt yuv420p');
  });
});

describe('terminalOffsetS', () => {
  it('ramène un instant de la prise sur l’horloge du terminal', () => {
    // Le terminal démarre 2 s après la vidéo de la prise : 30 s dans la prise = 28 s dans le terminal.
    expect(terminalOffsetS(30, 2000)).toBe(28);
  });

  it('rend null avant le début de la capture du terminal : il n’y a rien à incruster', () => {
    expect(terminalOffsetS(1.5, 2000)).toBeNull();
    expect(terminalOffsetS(2, 2000)).toBe(0);
  });
});

describe('parseTerminalMode', () => {
  it('prend la page par défaut du README, la fenêtre en option, ou rien', () => {
    expect(parseTerminalMode('page')).toBe('page');
    expect(parseTerminalMode('gdigrab')).toBe('gdigrab');
    expect(parseTerminalMode('off')).toBe('off');
    expect(parseTerminalMode('')).toBe('off');
  });

  it('refuse un mode inconnu plutôt que de filmer en silence la mauvaise chose', () => {
    expect(() => parseTerminalMode('fenetre')).toThrow(/page.*gdigrab.*off/s);
  });
});

describe('insetRect', () => {
  it('rogne la bordure de la fenêtre, symétriquement', () => {
    expect(insetRect({ x: 33, y: 20, w: 2848, h: 1524 }, 8)).toEqual({ x: 41, y: 28, w: 2832, h: 1508 });
  });

  it('ne rogne rien avec un retrait nul', () => {
    const r = { x: 10, y: 20, w: 300, h: 200 };
    expect(insetRect(r, 0)).toEqual(r);
  });

  it('refuse un retrait qui mangerait la fenêtre : on filmerait zéro pixel', () => {
    expect(() => insetRect({ x: 0, y: 0, w: 40, h: 40 }, 20)).toThrow(/retrait/i);
  });
});

describe('gdigrabRegionArgs', () => {
  // La fenêtre de Windows Terminal se rend en DirectX : une capture `-i title=…` la rend NOIRE
  // (vérifié sur cette machine, ffmpeg 9). La zone de l'écran, elle, passe par le bureau composé
  // et montre la fenêtre telle qu'elle est.
  const region = { x: 33, y: 20, w: 2848, h: 1524 };

  it('filme une zone du bureau, en pixels physiques', () => {
    const args = gdigrabRegionArgs({ region, fps: 25, outPath: 'C:/out/cli.terminal.mp4' }).join(' ');
    expect(args).toContain('-f gdigrab');
    expect(args).toContain('-offset_x 33');
    expect(args).toContain('-offset_y 20');
    expect(args).toContain('-video_size 2848x1524');
    expect(args).toContain('-i desktop');
  });

  it('garde la cadence de la prise et ne dessine pas le curseur', () => {
    const args = gdigrabRegionArgs({ region, fps: 25, outPath: 'o.mp4' }).join(' ');
    expect(args).toContain('-framerate 25');
    expect(args).toContain('-draw_mouse 0');
  });

  it('réduit une capture plus large que la limite, sinon l’encodage vole du CPU à la prise', () => {
    const args = gdigrabRegionArgs({ region, fps: 25, outPath: 'o.mp4', maxWidth: 1280 }).join(' ');
    expect(args).toContain('scale=1280:-2');
  });

  it('laisse une capture déjà petite intacte, en dimensions paires', () => {
    const small = { x: 0, y: 0, w: 961, h: 601 };
    const args = gdigrabRegionArgs({ region: small, fps: 25, outPath: 'o.mp4', maxWidth: 1280 }).join(' ');
    expect(args).toContain('scale=trunc(iw/2)*2:trunc(ih/2)*2');
  });

  it('écrit en dernier le fichier demandé', () => {
    const args = gdigrabRegionArgs({ region, fps: 25, outPath: 'C:/out/cli.terminal.mp4' });
    expect(args[args.length - 1]).toBe('C:/out/cli.terminal.mp4');
  });
});

describe('parseTerminalMode, mode fenêtre', () => {
  it('connaît le mode « window » : la zone d’écran d’une vraie fenêtre Claude Code', () => {
    expect(parseTerminalMode('window')).toBe('window');
  });
});
