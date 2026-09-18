import type { Options } from '@anthropic-ai/claude-agent-sdk';
import { ROBOT_MCP_NAME } from './streamToDashboard';

/** Modèle par défaut (spec : Opus 5), surchargé par `TOMATO_MODEL`. */
export const DEFAULT_MODEL = 'claude-opus-5';

/**
 * Tours agentiques maximaux par épisode : 40 appels d'outils (limite MCP de M5)
 * plus une marge pour les tours de texte seul et le `report` final.
 */
export const AGENT_MAX_TURNS = 50;

/**
 * Limite de taille des résultats MCP côté Claude Code (défaut 25 000 tokens). Trois PNG 800×800
 * en base64 dépassent ce défaut ; les images restent soumises à cette variable (doc MCP),
 * d'où une valeur haute passée dans l'environnement du processus Claude Code.
 */
export const MAX_MCP_OUTPUT_TOKENS = '400000';

export interface QueryOptionsInput {
  mcpUrl: string;
  model: string;
  systemPrompt: string;
  /** Identifiant de session à reprendre, null pour une nouvelle session. */
  sessionId: string | null;
  abortController: AbortController;
  stderr?: (data: string) => void;
}

/**
 * Options de `query()` pour un épisode. Noms vérifiés sur `Options` de
 * @anthropic-ai/claude-agent-sdk 0.3.275 (sdk.d.ts) et la doc officielle.
 */
export function buildQueryOptions(input: QueryOptionsInput): Options {
  const base: Options = {
    systemPrompt: input.systemPrompt,
    model: input.model,
    mcpServers: { [ROBOT_MCP_NAME]: { type: 'http', url: input.mcpUrl, alwaysLoad: true } },
    tools: [],
    allowedTools: [`mcp__${ROBOT_MCP_NAME}__*`],
    permissionMode: 'dontAsk',
    strictMcpConfig: true,
    settingSources: [],
    persistSession: true,
    includePartialMessages: true,
    maxTurns: AGENT_MAX_TURNS,
    abortController: input.abortController,
    env: { ...process.env, MAX_MCP_OUTPUT_TOKENS },
  };
  const withStderr = input.stderr === undefined ? base : { ...base, stderr: input.stderr };
  return input.sessionId === null ? withStderr : { ...withStderr, resume: input.sessionId };
}
