import { describe, expect, it } from 'vitest';
import { buildQueryOptions } from './queryOptions';
import {
  MAX_MCP_OUTPUT_TOKENS,
  NESTED_SESSION_VARS,
  mcpConfigJson,
  psLiteral,
  teeShellCommand,
  terminalArgs,
  visibleClaudeArgs,
  launchScript,
  visibleEnv,
  type VisibleCommandInput,
} from './visibleCommand';

const INPUT: VisibleCommandInput = {
  mcpUrl: 'http://localhost:7331/mcp',
  model: 'opus',
  mcpConfigPath: 'C:/data/video/cli/mcp.json',
  systemPromptPath: 'C:/repo/packages/server/prompts/system.md',
  wakePromptPath: 'C:/data/video/cli/wake-1.txt',
  teePath: 'C:/data/video/cli/episode-1.jsonl',
  sessionId: null,
};

describe('visibleClaudeArgs', () => {
  const args = visibleClaudeArgs(INPUT);
  const value = (flag: string): string | undefined => args[args.indexOf(flag) + 1];

  it('est headless : -p, flux JSON ligne à ligne, verbeux', () => {
    expect(args[0]).toBe('-p');
    expect(value('--output-format')).toBe('stream-json');
    expect(args).toContain('--verbose');
  });

  it('lit le message de réveil dans un fichier : le prompt ne passe pas par la ligne de commande', () => {
    expect(args[1]).toBe(`(Get-Content -Raw ${psLiteral(INPUT.wakePromptPath)})`);
  });

  it('lit le prompt système dans son fichier, le même que celui du SDK', () => {
    expect(value('--system-prompt')).toBe(`(Get-Content -Raw ${psLiteral(INPUT.systemPromptPath)})`);
  });

  // Chaque ligne fait écho à une option de `buildQueryOptions` : c'est la même session, filmée.
  it('reprend option par option les choix du SDK', () => {
    const sdk = buildQueryOptions({
      mcpUrl: INPUT.mcpUrl,
      model: INPUT.model,
      systemPrompt: 'x',
      sessionId: null,
      abortController: new AbortController(),
    });
    expect(value('--model')).toBe(sdk.model);
    expect(value('--allowedTools')).toBe(psLiteral((sdk.allowedTools ?? [])[0] ?? ''));
    expect(value('--permission-mode')).toBe(sdk.permissionMode);
    expect(args).toContain('--strict-mcp-config');
    expect(value('--tools')).toBe("''");
    expect(value('--setting-sources')).toBe("''");
    expect(value('--mcp-config')).toBe(psLiteral(INPUT.mcpConfigPath));
  });

  it('coupe Claude in Chrome, serveur MCP intégré que --strict-mcp-config ne couvre pas', () => {
    expect(args).toContain('--no-chrome');
  });

  it('ne reprend pas la session quand il n’y en a pas', () => {
    expect(args).not.toContain('--resume');
  });

  it('reprend la session de l’épisode précédent quand le SDK le ferait', () => {
    const resumed = visibleClaudeArgs({ ...INPUT, sessionId: 'f63641df-450d-4e3b-8880-1d617735010b' });
    expect(resumed[resumed.indexOf('--resume') + 1]).toBe(psLiteral('f63641df-450d-4e3b-8880-1d617735010b'));
  });
});

describe('teeShellCommand', () => {
  const command = teeShellCommand(INPUT);

  it('écrit le flux dans le fichier que le serveur suit, et le laisse à l’écran', () => {
    expect(command).toContain('| Tee-Object -FilePath');
    expect(command).toContain(psLiteral(INPUT.teePath));
  });

  it('commence par claude, rien devant : la fenêtre ne montre que le binaire', () => {
    expect(command.startsWith('claude -p ')).toBe(true);
  });

  it('tient sur une ligne : ni le prompt système ni le réveil n’y sont recopiés', () => {
    expect(command).not.toContain('\n');
    expect(command.length).toBeLessThan(700);
  });
});

describe('launchScript', () => {
  const script = launchScript('Claude Code headless', INPUT);
  const lines = script.split(/\r?\n/).filter((l) => l !== '');

  // `wt.exe --title` est sans effet sur cette version : la fenetre ne s'ouvre meme pas. Le titre
  // se pose donc depuis l'interieur — une affectation, qui n'imprime rien a l'ecran — et c'est
  // par lui que le pilote trouve la fenetre.
  it('pose le titre par lequel le pilote trouvera la fenêtre, sans rien imprimer', () => {
    expect(lines[0]).toBe("$Host.UI.RawUI.WindowTitle = 'Claude Code headless'");
  });

  it('n’exécute rien d’autre que la commande claude : deux lignes, pas une de plus', () => {
    expect(lines).toHaveLength(2);
    expect(lines[1]).toBe(teeShellCommand(INPUT));
  });
});

describe('terminalArgs', () => {
  const args = terminalArgs({ cols: 110, rows: 32, x: 20, y: 20, cwd: 'C:/Tomato-collector' }, 'C:/data/video/cli/launch.ps1');

  // Le dossier de depart decide de ce que Claude Code demande au demarrage : dans un dossier deja
  // approuve, aucune invite de confiance. Sans cette option, wt ouvre la fenetre dans le profil de
  // l'utilisateur (releve sur une vraie sortie : cwd = le profil, pas le depot).
  it('part du dossier demande, celui que Claude Code a deja approuve', () => {
    expect(args[args.indexOf('-d') + 1]).toBe('C:/Tomato-collector');
  });

  it('ouvre une fenêtre neuve de Windows Terminal, dimensionnée et placée', () => {
    expect(args[0]).toBe('-w');
    expect(args[1]).toBe('new');
    expect(args).not.toContain('--title');
    expect(args[args.indexOf('--size') + 1]).toBe('110,32');
    expect(args[args.indexOf('--pos') + 1]).toBe('20,20');
  });

  // Windows Terminal coupe sa ligne de commande sur les `;`, qui y separent ses sous-commandes :
  // avec un `-Command` en ligne, la fenetre ne s'ouvrait pas du tout. Un fichier n'a pas ce
  // probleme, ni celui des guillemets a faire traverser trois analyseurs.
  it('y joue un fichier de script, pas une commande en ligne', () => {
    expect(args).toContain('powershell');
    expect(args).toContain('-NoExit');
    expect(args).toContain('-NoProfile');
    expect(args).not.toContain('-Command');
    expect(args[args.length - 1]).toBe('C:/data/video/cli/launch.ps1');
    expect(args[args.length - 2]).toBe('-File');
  });
});

describe('psLiteral', () => {
  it('cite pour PowerShell et double les apostrophes', () => {
    expect(psLiteral('C:/a b/x.json')).toBe("'C:/a b/x.json'");
    expect(psLiteral("l'agent")).toBe("'l''agent'");
  });
});

describe('mcpConfigJson', () => {
  it('nomme le serveur « robot », comme le SDK : les outils s’appellent mcp__robot__…', () => {
    const parsed: unknown = JSON.parse(mcpConfigJson('http://localhost:7331/mcp'));
    expect(parsed).toEqual({ mcpServers: { robot: { type: 'http', url: 'http://localhost:7331/mcp' } } });
  });
});

describe('visibleEnv', () => {
  it('relève la limite de sortie MCP, comme le SDK', () => {
    expect(visibleEnv({}).MAX_MCP_OUTPUT_TOKENS).toBe(MAX_MCP_OUTPUT_TOKENS);
  });

  it('retire les marqueurs de session imbriquée, gardés hors de la fenêtre filmée', () => {
    const env = visibleEnv({ CLAUDECODE: '1', CLAUDE_CODE_CHILD_SESSION: '1', PATH: 'C:/bin' });
    expect(env.CLAUDECODE).toBeUndefined();
    expect(env.CLAUDE_CODE_CHILD_SESSION).toBeUndefined();
    expect(env.PATH).toBe('C:/bin');
  });

  it('ne touche pas à l’authentification du propriétaire', () => {
    expect(NESTED_SESSION_VARS).not.toContain('CLAUDE_CODE_OAUTH_TOKEN');
    expect(NESTED_SESSION_VARS).not.toContain('ANTHROPIC_API_KEY');
  });
});
