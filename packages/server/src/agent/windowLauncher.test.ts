import { describe, expect, it } from 'vitest';
import { closeWindowCommand, startProcessCommand, windowsQuoted } from './windowLauncher';

describe('startProcessCommand', () => {
  // Windows PowerShell 5.1 concatène `-ArgumentList` sans rien citer. Mesuré ici : dès qu'un
  // argument contenait une espace, `wt.exe` recevait des morceaux et la fenêtre ne s'ouvrait pas.
  it('cite chaque argument, sinon une commande à espaces casse le lancement', () => {
    expect(startProcessCommand('wt.exe', ['-w', 'new', '-Command', 'claude -p x'])).toBe(
      `Start-Process 'wt.exe' -ArgumentList '"-w"','"new"','"-Command"','"claude -p x"'`,
    );
  });

  it('double les apostrophes : c’est ainsi qu’une chaîne PowerShell les échappe', () => {
    expect(startProcessCommand('wt.exe', ["l'agent"])).toContain(`'"l''agent"'`);
  });
});

describe('windowsQuoted', () => {
  it('échappe les guillemets internes, que la commande claude porte partout', () => {
    expect(windowsQuoted('dit "oui"')).toBe('"dit \\"oui\\""');
  });

  it('laisse un argument simple entre guillemets, sans rien d’autre', () => {
    expect(windowsQuoted('-w')).toBe('"-w"');
  });
});

describe('closeWindowCommand', () => {
  it('ferme la fenêtre par sa poignée (WM_CLOSE), sans tuer le processus', () => {
    const cmd = closeWindowCommand(2163430);
    expect(cmd).toContain('2163430');
    expect(cmd).toContain('0x0010');
    expect(cmd).toContain('PostMessage');
  });
});
