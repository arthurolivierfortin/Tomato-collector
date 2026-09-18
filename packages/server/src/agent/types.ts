import type { Options } from '@anthropic-ai/claude-agent-sdk';
import type { Phase, ServerToDashboard, Vec3, WorldState } from '@tomato/shared';

export type EpisodeOutcome = 'harvested' | 'missed' | 'aborted';

/** Événement de réveil : la tomate mûre détectée. */
export interface WakeEvent {
  tomatoId: number;
  positionCm: Vec3;
  ripeness: number;
}

/** Sous-ensemble structurel du `Hub` de M5 consommé par le runner. */
export interface AgentHub {
  broadcast(m: ServerToDashboard): void;
}

/** Sous-ensemble structurel de `SessionState` / `Session` de M5. */
export interface AgentSessionState {
  phase: Phase;
  episodeId: string | null;
  targetTomatoId: number | null;
}

export interface AgentSession {
  get(): AgentSessionState;
  startEpisode(tomatoId: number): unknown;
  endEpisode(outcome: EpisodeOutcome, note: string): unknown;
  onPhase(fn: (phase: Phase) => void): unknown;
}

/** Sous-ensemble structurel du `SimBridge` de M5. */
export interface AgentSim {
  latestState(): WorldState | null;
}

/** Bloc de contenu d'un message assistant, réduit aux champs lus par M6. */
export interface AgentContentBlock {
  type: string;
  text?: string;
  id?: string;
  name?: string;
  input?: unknown;
}

/**
 * Messages du flux `query()` du Claude Agent SDK, réduits aux champs lus par M6.
 * Chaque variante est un sous-type structurel du `SDKMessage` correspondant
 * (vérifié par `toAgentMessage` dans `sdkQuery.ts`, qui ne compile que si c'est vrai).
 */
export type AgentMessage =
  | {
      type: 'system';
      subtype: 'init';
      session_id: string;
      model: string;
      mcp_servers: ReadonlyArray<{ name: string; status: string }>;
      apiKeySource: string;
    }
  | { type: 'assistant'; message: { content: ReadonlyArray<AgentContentBlock> } }
  | { type: 'stream_event'; event: { type: string; delta?: unknown } }
  | {
      type: 'result';
      subtype: string;
      is_error: boolean;
      total_cost_usd: number;
      duration_ms: number;
      num_turns: number;
      session_id: string;
    }
  | { type: 'other' };

/** `query()` du SDK, injectable (les tests passent un générateur asynchrone factice). */
export type QueryFn = (prompt: string, options: Options) => AsyncIterable<AgentMessage>;

export interface AgentRunner {
  /** Met un réveil en file ; démarre un épisode si aucun n'est en cours. */
  wake(event: WakeEvent): void;
  /** true pendant un épisode. */
  busy(): boolean;
  /** Interrompt l'épisode en cours, vide la file, refuse les réveils suivants. */
  stop(): void;
  /** Résolue quand la file est vide et qu'aucun épisode n'est en cours (tests, script wake). */
  whenIdle(): Promise<void>;
}
