/**
 * Ouverture de la vraie fenêtre Windows Terminal de l'agent visible.
 *
 * Deux choses ont été mesurées sur cette machine, et elles décident de tout ce module :
 *
 * 1. **Un `spawn` depuis Node n'ouvre aucune fenêtre**, même `detached` et `windowsHide: false` :
 *    ni `powershell`, ni `wt.exe`. Seul `Start-Process` de PowerShell en ouvre une.
 * 2. **Windows PowerShell 5.1 ne cite pas les éléments de `-ArgumentList`** : il les concatène
 *    tels quels. Un argument contenant une espace — et la commande `claude` en contient beaucoup —
 *    est alors coupé en morceaux, `wt.exe` reçoit n'importe quoi et la fenêtre ne s'ouvre pas.
 *    Chaque argument est donc cité ici, à la main.
 */
import { spawn } from 'node:child_process';
import { silentLogger, type Logger } from '../log';
import { psLiteral } from './visibleCommand';
import type { OpenWindow, WindowLauncher } from './visibleQuery';

/** Un argument tel que `CreateProcess` le veut : entre guillemets, guillemets internes échappés. */
export function windowsQuoted(arg: string): string {
  return `"${arg.replace(/(\\*)"/g, '$1$1\\"')}"`;
}

/** La commande `Start-Process` qui ouvre la fenêtre, chaque argument cité deux fois plutôt qu'une. */
export function startProcessCommand(exe: string, args: readonly string[]): string {
  return `Start-Process ${psLiteral(exe)} -ArgumentList ${args.map((a) => psLiteral(windowsQuoted(a))).join(',')}`;
}

/**
 * La commande PowerShell qui tue le shell de la fenêtre **et son `claude`**, retrouvés par le
 * chemin du script de lancement — unique à l'épisode. `taskkill /T` prend l'arbre : sans lui, le
 * `claude` fils survivrait au shell et continuerait d'appeler un serveur MCP arrêté.
 *
 * `.Contains(…)` et non `-like` : un chemin peut contenir des crochets, que `-like` lirait comme
 * un motif. Et `-ne $null` d'abord : certaines lignes de commande ne sont pas lisibles.
 */
export function killByScriptCommand(scriptPath: string): string {
  return (
    `Get-CimInstance Win32_Process | Where-Object { $_.CommandLine -ne $null -and $_.CommandLine.Contains(${psLiteral(scriptPath)}) } ` +
    '| ForEach-Object { taskkill /T /F /PID $_.ProcessId }'
  );
}

/**
 * Lanceur réel. La fenêtre n'est **pas** refermée à la fin de l'épisode : `-NoExit` la laisse
 * ouverte, et c'est le pilote de la prise qui la ferme quand il a fini de filmer. Le serveur, lui,
 * n'a plus rien à y faire une fois le message `result` passé.
 */
export function createWindowLauncher(log: Logger = silentLogger): WindowLauncher {
  return {
    launch(args, env): OpenWindow {
      const command = startProcessCommand('wt.exe', [...args]);
      const child = spawn('powershell.exe', ['-NoProfile', '-Command', command], { env, stdio: 'ignore' });
      child.once('error', (e) => log(`agent visible : ouverture de la fenêtre impossible (${e.message})`));
      // Le chemin du script de lancement est le dernier argument de `wt.exe`, et il est unique à
      // l'épisode : c'est par lui qu'on retrouvera le shell et son `claude` s'il faut les couper.
      const scriptPath = args[args.length - 1] ?? '';
      return {
        close(reason) {
          // Fin normale : `claude` s'est arrêté seul après son `result`, et la fenêtre doit rester
          // à l'image jusqu'à la fin de la prise (`-NoExit`). Rien à faire.
          if (reason === 'finished') return Promise.resolve();
          log(`agent visible : épisode coupé, arrêt du processus de la fenêtre (${scriptPath})`);
          return new Promise<void>((done) => {
            const killer = spawn('powershell.exe', ['-NoProfile', '-Command', killByScriptCommand(scriptPath)], { stdio: 'ignore' });
            killer.once('error', (e) => {
              log(`agent visible : arrêt du processus impossible (${e.message})`);
              done();
            });
            killer.once('exit', () => done());
          });
        },
      };
    },
  };
}
