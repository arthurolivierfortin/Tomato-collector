import { describe, expect, it } from 'vitest';
import { killByScriptCommand, startProcessCommand, windowsQuoted } from './windowLauncher';

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

describe('killByScriptCommand', () => {
  /*
   * Un episode coupe (arret du serveur, delai depasse) laisse sinon un `claude` qui continue
   * d'appeler un serveur MCP arrete et de depenser. On le retrouve par le chemin de son script de
   * lancement, unique a l'episode, et on tue l'arbre : le shell hote et le claude en dessous.
   */
  it('retrouve le shell par le chemin du script de lancement, et tue l’arbre', () => {
    const cmd = killByScriptCommand('C:/data/video/cli/session-1/launch-2.ps1');
    expect(cmd).toContain("Contains('C:/data/video/cli/session-1/launch-2.ps1')");
    expect(cmd).toContain('taskkill /T /F /PID');
  });

  it('cite le chemin pour PowerShell et se garde des lignes de commande vides', () => {
    const cmd = killByScriptCommand("C:/d'ossier/launch.ps1");
    expect(cmd).toContain("Contains('C:/d''ossier/launch.ps1')");
    expect(cmd).toContain('-ne $null');
  });

  it('n’emploie pas -like : un chemin peut contenir des crochets, que -like lit comme un motif', () => {
    expect(killByScriptCommand('C:/a/launch.ps1')).not.toContain('-like');
  });
});
