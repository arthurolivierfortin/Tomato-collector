import { describe, expect, it } from 'vitest';
import { manualLaunchNotice, parseWindowRect, windowLaunchArgs, windowLaunchLine, type WindowParams } from './cliTerminal';

const PARAMS: WindowParams = {
  script: 'C:/Tomato-collector/scripts/video/claude-window.ps1',
  title: 'Claude Code · Tomato Collector',
  cols: 110,
  rows: 32,
  x: 20,
  y: 20,
  argsFile: 'C:/tmp/cli/args.json',
  rectFile: 'C:/tmp/cli/window.json',
};

describe('windowLaunchArgs', () => {
  const args = windowLaunchArgs(PARAMS);

  it('ouvre une fenêtre qui reste ouverte après la session', () => {
    expect(args).toContain('-NoProfile');
    expect(args).toContain('-NoExit');
    expect(args[args.indexOf('-File') + 1]).toBe(PARAMS.script);
  });

  it('passe le titre, la taille et la position en paramètres nommés', () => {
    expect(args[args.indexOf('-Title') + 1]).toBe('Claude Code · Tomato Collector');
    expect(args[args.indexOf('-Cols') + 1]).toBe('110');
    expect(args[args.indexOf('-Rows') + 1]).toBe('32');
    expect(args[args.indexOf('-X') + 1]).toBe('20');
    expect(args[args.indexOf('-Y') + 1]).toBe('20');
  });

  it('passe les deux fichiers de la poignée de main : arguments de claude, et rectangle rendu', () => {
    expect(args[args.indexOf('-ArgsFile') + 1]).toBe('C:/tmp/cli/args.json');
    expect(args[args.indexOf('-RectFile') + 1]).toBe('C:/tmp/cli/window.json');
  });
});

describe('windowLaunchLine', () => {
  it('rend une ligne collable, les valeurs à espaces entre guillemets', () => {
    const line = windowLaunchLine(PARAMS);
    expect(line.startsWith('powershell ')).toBe(true);
    expect(line).toContain('-Title "Claude Code · Tomato Collector"');
    expect(line).toContain('-Cols 110');
    expect(line).toContain(`-File "${PARAMS.script}"`);
  });
});

describe('parseWindowRect', () => {
  it('lit le rectangle rendu par la fenêtre, en pixels physiques', () => {
    expect(parseWindowRect({ x: 33, y: 20, w: 2848, h: 1524 })).toEqual({ x: 33, y: 20, w: 2848, h: 1524 });
  });

  it('refuse un rectangle incomplet plutôt que de filmer n’importe où', () => {
    expect(parseWindowRect({ x: 33, y: 20, w: 2848 })).toBeNull();
    expect(parseWindowRect({ x: 33, y: 20, w: '2848', h: 1524 })).toBeNull();
    expect(parseWindowRect(null)).toBeNull();
    expect(parseWindowRect('33,20')).toBeNull();
  });

  it('refuse une fenêtre de taille nulle : ffmpeg y capturerait zéro pixel', () => {
    expect(parseWindowRect({ x: 0, y: 0, w: 0, h: 600 })).toBeNull();
    expect(parseWindowRect({ x: 0, y: 0, w: 900, h: -1 })).toBeNull();
  });
});

describe('manualLaunchNotice', () => {
  const notice = manualLaunchNotice(PARAMS, 'claude --mcp-config "C:/tmp/cli/mcp.json" …');

  it('donne la commande exacte à lancer et dit ce que le pilote attend', () => {
    expect(notice).toContain('powershell');
    expect(notice).toContain(PARAMS.script);
    expect(notice).toContain(PARAMS.rectFile);
  });

  it('rappelle la seule règle de la prise : ne rien poser par-dessus la fenêtre', () => {
    expect(notice.toLowerCase()).toContain('par-dessus');
  });

  it('montre la commande claude réellement construite', () => {
    expect(notice).toContain('claude --mcp-config');
  });
});
