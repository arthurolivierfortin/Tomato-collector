import { resolve } from 'node:path';

export interface ServerConfig {
  /** Port HTTP : MCP (`/mcp`), `/health`, `/episodes`. */
  mcpPort: number;
  /** Port du hub WebSocket (sim et dashboards). */
  wsPort: number;
  /** Modèle de l'agent (M6). */
  model: string;
  /** `off` : aucun runner d'agent, pilotage à la main depuis Claude Code. */
  agent: 'on' | 'off';
  /** Dossier des journaux d'épisodes. */
  episodesDir: string;
}

export const DEFAULT_MCP_PORT = 7331;
export const DEFAULT_WS_PORT = 7332;
export const DEFAULT_MODEL = 'claude-opus-5';
/** `packages/server/src` → racine du dépôt → `data/episodes`. */
export const DEFAULT_EPISODES_DIR = resolve(import.meta.dirname, '../../../data/episodes');

function readPort(raw: string | undefined, fallback: number): number {
  if (raw === undefined || raw === '') return fallback;
  const n = Number(raw);
  return Number.isInteger(n) && n >= 0 && n <= 65535 ? n : fallback;
}

function nonEmpty(raw: string | undefined, fallback: string): string {
  const v = raw?.trim();
  return v !== undefined && v !== '' ? v : fallback;
}

/** Lit les variables d'environnement TOMATO_* ; toute valeur absente ou invalide prend la valeur par défaut. */
export function readConfig(env: Record<string, string | undefined>): ServerConfig {
  return {
    mcpPort: readPort(env.TOMATO_MCP_PORT, DEFAULT_MCP_PORT),
    wsPort: readPort(env.TOMATO_WS_PORT, DEFAULT_WS_PORT),
    model: nonEmpty(env.TOMATO_MODEL, DEFAULT_MODEL),
    agent: env.TOMATO_AGENT === 'off' ? 'off' : 'on',
    episodesDir: nonEmpty(env.TOMATO_EPISODES_DIR, DEFAULT_EPISODES_DIR),
  };
}
