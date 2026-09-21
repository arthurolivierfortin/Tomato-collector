import { resolve } from 'node:path';

export interface ServerConfig {
  /** Port HTTP : MCP (`/mcp`), `/health`, `/episodes`. */
  mcpPort: number;
  /** Port du hub WebSocket (sim et dashboards). */
  wsPort: number;
  /** Modèle de l'agent (M6). */
  model: string;
  /**
   * `on` : le SDK, dans un tuyau invisible. `off` : aucun runner, pilotage à la main.
   * `visible` : **le même agent headless**, lancé dans une vraie fenêtre Windows Terminal dont la
   * sortie brute (`--output-format stream-json`) est filmée, et que le serveur relit dans le
   * fichier écrit par `Tee-Object` (issue vidéo : montrer que la session est réelle).
   */
  agent: 'on' | 'off' | 'visible';
  /** Fenêtre de l'agent visible : où travailler, comment la nommer, quelle taille lui donner. */
  visible: VisibleConfig;
  /** Dossier des journaux d'épisodes. */
  episodesDir: string;
  /** Durée minimale d'un appel d'outil, de `tool_call_start` à `tool_call_result` (0 = pas de rythme). */
  toolPacingMs: number;
  /**
   * `on` : le flux de la session agent est imprimé sur la sortie standard (`logStream.ts`), pour
   * qu'un vrai terminal le montre dans la vidéo de démo. Sans effet sur le dashboard.
   */
  logStream: 'on' | 'off';
  /**
   * Fichier où recopier ce flux, avec ses couleurs ANSI. C'est ce fichier que la page « terminal »
   * du pipeline vidéo suit et affiche : elle montre la sortie réelle du processus, pas une
   * reconstitution. Vide (défaut) : rien n'est écrit sur disque.
   */
  logFile: string;
}

/** Fenêtre filmée de l'agent visible. */
export interface VisibleConfig {
  /** Titre posé sur la fenêtre : c'est par lui que `record.ts` la trouve pour la filmer. */
  title: string;
  /** Colonnes et lignes du terminal ; 110 × 32 tient dans un écran de 1536 × 960. */
  cols: number;
  rows: number;
  /** Coin haut gauche, en points logiques (`wt --pos`). */
  x: number;
  y: number;
  /** Dossier de travail : prompts, configuration MCP et fichiers `.jsonl` des épisodes. */
  dir: string;
}

export const DEFAULT_VISIBLE_TITLE = 'Claude Code headless';
/** `packages/server/src` → racine du dépôt → `data/video/cli`. */
export const DEFAULT_VISIBLE_DIR = resolve(import.meta.dirname, '../../../data/video/cli');

export const DEFAULT_MCP_PORT = 7331;
export const DEFAULT_WS_PORT = 7332;
export const DEFAULT_MODEL = 'claude-opus-5';
/** Rythme de lecture : un appel d'outil dure au moins 1,5 s pour rester suivable à l'écran (issue #21). */
export const DEFAULT_TOOL_PACING_MS = 1500;
/** `packages/server/src` → racine du dépôt → `data/episodes`. */
export const DEFAULT_EPISODES_DIR = resolve(import.meta.dirname, '../../../data/episodes');

function readPort(raw: string | undefined, fallback: number): number {
  if (raw === undefined || raw === '') return fallback;
  const n = Number(raw);
  return Number.isInteger(n) && n >= 0 && n <= 65535 ? n : fallback;
}

/** Durée en ms : entier ≥ 0 ; toute autre valeur retombe sur la valeur par défaut. */
function readMs(raw: string | undefined, fallback: number): number {
  if (raw === undefined || raw.trim() === '') return fallback;
  const n = Number(raw);
  return Number.isInteger(n) && n >= 0 ? n : fallback;
}

/** Entier strictement positif : une fenêtre de zéro colonne n'a pas de sens. */
function readPositive(raw: string | undefined, fallback: number): number {
  const n = Number(raw ?? '');
  return Number.isInteger(n) && n > 0 ? n : fallback;
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
    agent: env.TOMATO_AGENT === 'off' ? 'off' : env.TOMATO_AGENT === 'visible' ? 'visible' : 'on',
    visible: {
      title: nonEmpty(env.TOMATO_VISIBLE_TITLE, DEFAULT_VISIBLE_TITLE),
      cols: readPositive(env.TOMATO_VISIBLE_COLS, 110),
      rows: readPositive(env.TOMATO_VISIBLE_ROWS, 32),
      x: readMs(env.TOMATO_VISIBLE_X, 20),
      y: readMs(env.TOMATO_VISIBLE_Y, 20),
      dir: nonEmpty(env.TOMATO_VISIBLE_DIR, DEFAULT_VISIBLE_DIR),
    },
    episodesDir: nonEmpty(env.TOMATO_EPISODES_DIR, DEFAULT_EPISODES_DIR),
    toolPacingMs: readMs(env.TOMATO_TOOL_PACING_MS, DEFAULT_TOOL_PACING_MS),
    logStream: env.TOMATO_LOG_STREAM === 'on' ? 'on' : 'off',
    logFile: nonEmpty(env.TOMATO_LOG_FILE, ''),
  };
}
