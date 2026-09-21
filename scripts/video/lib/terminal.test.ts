import { describe, expect, it } from 'vitest';
import { gdigrabArgs, parseTerminalMode, terminalOffsetS } from './terminal';

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

describe('parseTerminalMode, mode fenêtre', () => {
  it('connaît le mode « window » : la zone d’écran d’une vraie fenêtre Claude Code', () => {
    expect(parseTerminalMode('window')).toBe('window');
  });
});
