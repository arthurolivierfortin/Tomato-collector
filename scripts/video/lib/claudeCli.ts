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
