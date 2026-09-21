import { describe, expect, it } from 'vitest';
import { gdigrabArgs, parseTerminalMode, terminalPipStart } from './terminal';

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

describe('terminalPipStart', () => {
  it('cale la vignette sur l’horloge du terminal quand la piste existe déjà', () => {
    expect(terminalPipStart(30, 2000)).toEqual({ atS: 28, delayS: 0 });
    expect(terminalPipStart(2, 2000)).toEqual({ atS: 0, delayS: 0 });
  });

  it('retarde la vignette au lieu de la jeter quand la fenêtre s’ouvre après le début du plan', () => {
    // C'est le défaut du montage v3 : le segment « Detection, then the agent wakes up » partait
    // 1,8 s avant l'ouverture de la fenêtre et perdait sa vignette pendant ses 9,8 s entières.
    expect(terminalPipStart(20.737, 22_580)).toEqual({ atS: 0, delayS: 1.843 });
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

describe('parseTerminalMode, mode fenêtre', () => {
  it('connaît le mode « window » : la zone d’écran d’une vraie fenêtre Claude Code', () => {
    expect(parseTerminalMode('window')).toBe('window');
  });
});
