/**
 * Construction de la commande `claude` interactive filmée par la prise `--agent cli`.
 *
 * Le serveur tourne avec `TOMATO_AGENT=off` : aucun runner SDK n'ouvre de session. C'est un vrai
 * Claude Code, dans une vraie fenêtre de terminal, qui se branche sur le serveur MCP du robot et
 * récolte. Tout ce qui est ici est pur : la commande est construite et testée sans lancer quoi que
 * ce soit, et sans dépenser un sou.
 *
 * Trois choses viennent de `packages/server/src/agent/` et n'ont donc **pas** à être réinventées :
 * le prompt système (`prompts/system.md`), le message de réveil (`wakePrompt.ts`) et la limite de
 * taille des résultats MCP (`MAX_MCP_OUTPUT_TOKENS` de `queryOptions.ts`).
 *
 * Trois choses viennent du fournisseur Claude Code éprouvé de l'autre projet du propriétaire,
 * `C:\Meastro\llm-provider\dotnet\src\LLMProvider.ClaudeCodeProvider\ClaudeCodeLLMProvider.cs` :
 *
 * 1. le prompt système passe **en argument** (`--system-prompt <texte>`), pas par un fichier —
 *    le CLI n'offre pas de `--system-prompt-file` (vérifié sur `claude --help`, 2.1.278) ;
 * 2. la garde de longueur : `CreateProcess` plafonne la ligne de commande à ~32 767 caractères,
 *    et le fournisseur coupe prudemment à 25 000 ;
 * 3. `--tools ""` désactive les outils intégrés, comme `tools: []` côté SDK, et la variable
 *    `CLAUDECODE` doit être **retirée** de l'environnement du processus fils, sans quoi un `claude`
 *    lancé depuis une session Claude Code refuse de démarrer.
 */

/** Nom du serveur MCP tel que le README racine l'enregistre (`claude mcp add … tomato-robot …`). */
export const DEFAULT_MCP_NAME = 'tomato-robot';

/**
 * Longueur maximale du prompt système et du message de réveil réunis. `CreateProcess` plafonne
 * `lpCommandLine` à 32 767 caractères ; 25 000 laisse la place au reste des arguments.
 * Seuil repris de `ClaudeCodeLLMProvider.MaxPromptArgLength` (Maestro), éprouvé en production.
 */
export const MAX_CLAUDE_ARG_CHARS = 25_000;

/** Motif d'outils autorisés : tous les outils du serveur MCP, aucun autre. */
export function toolPattern(mcpName: string): string {
  return `mcp__${mcpName}__*`;
}

/** Fichier `--mcp-config` : le serveur du robot, en HTTP, sur le port de la session filmée. */
export function mcpConfigJson(mcpName: string, mcpUrl: string): string {
  return JSON.stringify({ mcpServers: { [mcpName]: { type: 'http', url: mcpUrl } } }, null, 2);
}

/**
 * Le prompt système du serveur cite le serveur MCP par son nom : « the nine tools of the `robot`
 * MCP server ». Le SDK enregistre ce serveur sous `robot`, le CLI sous `tomato-robot` (README
 * racine), et les outils s'appellent donc `mcp__tomato-robot__…`. On substitue le nom plutôt que
 * de retoucher `prompts/system.md`, qui reste la source unique des deux chemins.
 */
export function systemPromptFor(mcpName: string, prompt: string): string {
  return prompt.replace(/`robot` MCP server/g, `\`${mcpName}\` MCP server`);
}

export interface ClaudeLaunch {
  readonly mcpName: string;
  /** Fichier JSON écrit par le pilote, passé à `--mcp-config`. */
  readonly mcpConfigPath: string;
  /** Prompt système du robot, déjà passé par `systemPromptFor`. */
  readonly systemPrompt: string;
  /** Message de réveil, construit par `buildWakePrompt` du serveur : le premier message tapé. */
  readonly wakePrompt: string;
  readonly model: string;
}

/**
 * Arguments de `claude` pour l'épisode filmé. Session **interactive** : ni `--print` ni
 * `--output-format`, le message de réveil est l'argument positionnel final, ce qui ouvre la
 * session et envoie ce message tout de suite (`claude [options] [prompt]`, `claude --help`).
 *
 * Correspondance avec `buildQueryOptions` du serveur, option par option :
 * `systemPrompt` → `--system-prompt`, `model` → `--model`, `mcpServers` → `--mcp-config`,
 * `strictMcpConfig` → `--strict-mcp-config`, `allowedTools` → `--allowedTools`,
 * `permissionMode: 'dontAsk'` → `--permission-mode dontAsk`, `tools: []` → `--tools ""`.
 * `maxTurns` n'a pas d'équivalent interactif : c'est le budget de 40 appels du serveur MCP qui
 * borne l'épisode, et le prompt système le dit.
 */
export function claudeArgs(launch: ClaudeLaunch): string[] {
  const size = launch.systemPrompt.length + launch.wakePrompt.length;
  if (size > MAX_CLAUDE_ARG_CHARS) {
    throw new Error(
      `prompt système + réveil = ${size} caractères, au-delà de ${MAX_CLAUDE_ARG_CHARS} : ` +
        'la ligne de commande Windows est plafonnée à 32 767 caractères et « claude » ne démarrerait pas.',
    );
  }
  return [
    '--mcp-config',
    launch.mcpConfigPath,
    '--strict-mcp-config',
    '--allowedTools',
    toolPattern(launch.mcpName),
    '--permission-mode',
    'dontAsk',
    '--tools',
    '',
    '--model',
    launch.model,
    '--system-prompt',
    launch.systemPrompt,
    launch.wakePrompt,
  ];
}

/**
 * Limite de taille des résultats MCP côté Claude Code : trois PNG 800×800 en base64 dépassent le
 * défaut de 25 000 tokens. Même valeur que `MAX_MCP_OUTPUT_TOKENS` de `queryOptions.ts`, recopiée
 * plutôt qu'importée pour que `scripts/video` reste un programme indépendant de `packages/server`.
 */
export const MAX_MCP_OUTPUT_TOKENS = '400000';

/**
 * Environnement du processus `claude`. `CLAUDECODE` est **retiré** : un `claude` lancé depuis une
 * session Claude Code le trouve dans son environnement et refuse de démarrer. Leçon reprise de
 * `ClaudeCodeLLMProvider.RunProcessAsync` (Maestro), qui fait exactement ça.
 */
export function claudeEnv(env: Readonly<Record<string, string | undefined>>): Record<string, string | undefined> {
  const out = { ...env, MAX_MCP_OUTPUT_TOKENS };
  delete out['CLAUDECODE'];
  return out;
}

/** Au-delà, un argument est abrégé dans la ligne affichée : le prompt système fait 15 ko. */
const DISPLAY_MAX = 60;

function displayArg(arg: string): string {
  const shown = arg.length > DISPLAY_MAX ? `${arg.slice(0, DISPLAY_MAX)}… (+${arg.length - DISPLAY_MAX} car.)` : arg;
  return /^[A-Za-z0-9._:/\\-]+$/.test(shown) && shown !== '' ? shown : `"${shown}"`;
}

/**
 * La commande, lisible et collable, pour la procédure manuelle : quand la fenêtre ne s'ouvre pas
 * toute seule, le propriétaire la lance lui-même et le pilote attend son titre.
 */
export function claudeCommandLine(args: readonly string[]): string {
  return ['claude', ...args.map(displayArg)].join(' ');
}
