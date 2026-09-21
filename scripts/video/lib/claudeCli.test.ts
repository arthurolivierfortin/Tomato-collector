import { describe, expect, it } from 'vitest';
import {
  claudeArgs,
  claudeCommandLine,
  claudeEnv,
  DEFAULT_CLI_MODEL,
  DEFAULT_MCP_NAME,
  MAX_CLAUDE_ARG_CHARS,
  NESTED_SESSION_VARS,
  mcpConfigJson,
  systemPromptFor,
  toolPattern,
  type ClaudeLaunch,
} from './claudeCli';

const LAUNCH: ClaudeLaunch = {
  mcpName: 'tomato-robot',
  mcpConfigPath: 'C:/tmp/mcp.json',
  systemPrompt: 'You are the control agent.',
  wakePrompt: 'A ripe tomato was detected: tomato #1.',
  model: 'opus',
};

describe('toolPattern', () => {
  it('nomme les outils du serveur MCP tel que Claude Code les préfixe', () => {
    expect(toolPattern('tomato-robot')).toBe('mcp__tomato-robot__*');
    expect(toolPattern('robot')).toBe('mcp__robot__*');
  });

  it('prend « tomato-robot » par défaut, le nom du README racine', () => {
    expect(DEFAULT_MCP_NAME).toBe('tomato-robot');
  });
});

describe('mcpConfigJson', () => {
  it('décrit le serveur en HTTP sur l’URL de la session', () => {
    const parsed: unknown = JSON.parse(mcpConfigJson('tomato-robot', 'http://localhost:7511/mcp'));
    expect(parsed).toEqual({ mcpServers: { 'tomato-robot': { type: 'http', url: 'http://localhost:7511/mcp' } } });
  });

  it('porte le nom demandé, pas un nom en dur', () => {
    const parsed = JSON.parse(mcpConfigJson('robot', 'http://localhost:7331/mcp')) as { mcpServers: Record<string, unknown> };
    expect(Object.keys(parsed.mcpServers)).toEqual(['robot']);
  });
});

describe('systemPromptFor', () => {
  // Le prompt système du serveur cite le serveur MCP par son nom (« the nine tools of the `robot`
  // MCP server »). Le SDK l'appelle `robot`, le CLI l'appelle `tomato-robot` : sans cette
  // substitution, l'agent lirait un nom de serveur qui n'existe pas dans sa session.
  it('remplace le nom du serveur MCP cité par le prompt', () => {
    const prompt = 'Your only way to act is the nine tools of the `robot` MCP server. Everything else is off.';
    expect(systemPromptFor('tomato-robot', prompt)).toBe(
      'Your only way to act is the nine tools of the `tomato-robot` MCP server. Everything else is off.',
    );
  });

  it('laisse le prompt intact quand le nom est déjà le bon', () => {
    const prompt = 'the nine tools of the `robot` MCP server';
    expect(systemPromptFor('robot', prompt)).toBe(prompt);
  });

  it('ne touche pas au mot « robot » employé hors du nom du serveur', () => {
    const prompt = 'You are the control agent of a small harvesting robot. Use the `robot` MCP server.';
    expect(systemPromptFor('tomato-robot', prompt)).toBe(
      'You are the control agent of a small harvesting robot. Use the `tomato-robot` MCP server.',
    );
  });
});

describe('claudeArgs', () => {
  const args = claudeArgs(LAUNCH);

  it('ouvre une session interactive : aucun --print, aucun --output-format', () => {
    expect(args).not.toContain('--print');
    expect(args).not.toContain('-p');
    expect(args).not.toContain('--output-format');
  });

  it('branche le serveur MCP du robot et ignore tous les autres', () => {
    expect(args).toContain('--mcp-config');
    expect(args[args.indexOf('--mcp-config') + 1]).toBe('C:/tmp/mcp.json');
    expect(args).toContain('--strict-mcp-config');
  });

  it('autorise les neuf outils du robot sans demander de permission', () => {
    expect(args[args.indexOf('--allowedTools') + 1]).toBe('mcp__tomato-robot__*');
    expect(args[args.indexOf('--permission-mode') + 1]).toBe('dontAsk');
  });

  it('coupe les outils intégrés, comme le SDK avec tools: []', () => {
    expect(args[args.indexOf('--tools') + 1]).toBe('');
  });

  it('passe le prompt système en argument (le CLI n’a pas de --system-prompt-file)', () => {
    expect(args[args.indexOf('--system-prompt') + 1]).toBe('You are the control agent.');
  });

  it('passe le modèle demandé', () => {
    expect(args[args.indexOf('--model') + 1]).toBe('opus');
  });

  // Mesuré en ouvrant une session sans message (donc sans coût) et en lisant l'en-tête à l'écran :
  // « --model claude-opus-5 » — le défaut du SDK — donne « Fable 5.1 with high effort », tandis que
  // « --model opus » donne « Opus 5 with xhigh effort ». Le CLI veut son alias.
  it('prend l’alias « opus » par défaut, le seul que le CLI résout vers Opus 5', () => {
    expect(DEFAULT_CLI_MODEL).toBe('opus');
  });

  it('coupe ce qui n’est pas le robot : pas de Claude in Chrome, pas de réglages du poste', () => {
    expect(args).toContain('--no-chrome');
    expect(args[args.indexOf('--setting-sources') + 1]).toBe('');
  });

  it('met le message de réveil en dernier : c’est le premier message de la session', () => {
    expect(args[args.length - 1]).toBe('A ripe tomato was detected: tomato #1.');
  });

  it('refuse une ligne de commande que CreateProcess ne pourrait pas porter', () => {
    const tooLong = { ...LAUNCH, systemPrompt: 'x'.repeat(MAX_CLAUDE_ARG_CHARS) };
    expect(() => claudeArgs(tooLong)).toThrow(/25000|trop long/i);
  });

  it('accepte un prompt système juste sous la limite', () => {
    const big = { ...LAUNCH, systemPrompt: 'x'.repeat(MAX_CLAUDE_ARG_CHARS - LAUNCH.wakePrompt.length) };
    expect(() => claudeArgs(big)).not.toThrow();
  });
});

describe('claudeEnv', () => {
  it('relève la limite de sortie MCP : trois PNG de vues dépassent le défaut de 25 000 tokens', () => {
    expect(claudeEnv({}).MAX_MCP_OUTPUT_TOKENS).toBe('400000');
  });

  it('retire CLAUDECODE, sinon un claude lancé depuis une session Claude Code ne démarre pas', () => {
    const env = claudeEnv({ CLAUDECODE: '1', PATH: 'C:/bin' });
    expect(env.CLAUDECODE).toBeUndefined();
    expect(env.PATH).toBe('C:/bin');
  });

  // Relevé à l'écran pendant la mise au point : lancé depuis une session Claude Code, le CLI
  // affiche « Transcript saving is off — inherited CLAUDE_CODE_CHILD_SESSION marker » en bas de
  // la fenêtre. Ce bandeau serait dans le film.
  it('retire les marqueurs de session imbriquée, qui mettent un avertissement à l’image', () => {
    const env = claudeEnv({ CLAUDE_CODE_CHILD_SESSION: '1', CLAUDE_CODE_SESSION_ID: 'x', CLAUDE_CODE_ENTRYPOINT: 'cli' });
    expect(env.CLAUDE_CODE_CHILD_SESSION).toBeUndefined();
    expect(env.CLAUDE_CODE_SESSION_ID).toBeUndefined();
    expect(env.CLAUDE_CODE_ENTRYPOINT).toBeUndefined();
  });

  it('garde l’authentification du propriétaire : rien de ce qui la porte n’est retiré', () => {
    expect(NESTED_SESSION_VARS).not.toContain('CLAUDE_CODE_OAUTH_TOKEN');
    expect(NESTED_SESSION_VARS).not.toContain('ANTHROPIC_API_KEY');
    expect(NESTED_SESSION_VARS).toContain('CLAUDECODE');
  });
});

describe('claudeCommandLine', () => {
  it('rend une ligne collable, les arguments à espaces entre guillemets', () => {
    const line = claudeCommandLine(['--allowedTools', 'mcp__tomato-robot__*', '--tools', '', 'deux mots']);
    expect(line).toBe('claude --allowedTools "mcp__tomato-robot__*" --tools "" "deux mots"');
  });

  it('abrège le prompt système, illisible et inutile dans une consigne affichée', () => {
    const line = claudeCommandLine(['--system-prompt', 'x'.repeat(4000), 'réveil']);
    expect(line).toContain('--system-prompt');
    expect(line).not.toContain('x'.repeat(200));
    expect(line.length).toBeLessThan(400);
  });
});
