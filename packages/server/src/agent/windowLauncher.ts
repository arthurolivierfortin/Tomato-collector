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

/** La commande PowerShell qui referme une fenêtre par sa poignée, sans tuer le processus au couteau. */
export function closeWindowCommand(handle: number): string {
  return (
    'Add-Type -Namespace TomatoClose -Name Api -MemberDefinition ' +
    `'[DllImport("user32.dll")] public static extern bool PostMessage(IntPtr h, uint m, IntPtr w, IntPtr l);'; ` +
    `[void][TomatoClose.Api]::PostMessage([IntPtr]${handle}, 0x0010, [IntPtr]::Zero, [IntPtr]::Zero)`
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
      return { close: () => Promise.resolve() };
    },
  };
}
