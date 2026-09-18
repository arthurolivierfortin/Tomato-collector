import type { Options } from '@anthropic-ai/claude-agent-sdk';
import type { Phase, ServerToDashboard, Vec3, WakeDetector, WorldState } from '@tomato/shared';

export type EpisodeOutcome = 'harvested' | 'missed' | 'aborted';

/**
 * Événement de réveil : la tomate déclarée mûre par la perception, et par quel détecteur (issue #23).
 * Issue #36 : il ne porte aucune maturité de la simulation — seule la confiance du détecteur fait foi.
 * `positionCm` reste la position connue de la sim : elle amorce la recherche de l'agent, elle ne décide rien.
 */
export interface WakeEvent {
  tomatoId: number;
  positionCm: Vec3;
  detector: WakeDetector;
  confidence: number;
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
  startEpisode(tomatoId: number, detection?: { detector: WakeDetector; confidence: number }): unknown;
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
  /** Blocs `tool_result` d'un message utilisateur : résultat renvoyé à l'agent. */
  tool_use_id?: string;
  content?: unknown;
  is_error?: boolean;
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
  | { type: 'user'; message: { content: string | ReadonlyArray<AgentContentBlock> } }
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
  /**
   * Interrompt l'épisode en cours, vide la file, refuse les réveils suivants. Résolue quand le flux
   * est coupé — après un court délai si un `report` vient de passer, le temps que le SDK livre son
   * message `result` et donc le coût de l'épisode.
   */
  stop(): Promise<void>;
  /** Résolue quand la file est vide et qu'aucun épisode n'est en cours (tests, script wake). */
  whenIdle(): Promise<void>;
}
