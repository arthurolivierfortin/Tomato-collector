import type { BlockId, CameraId, Phase, ServerToDashboard, ViewImage } from '@tomato/shared';

export type TraceKind = 'text' | 'tool' | 'event' | 'phase';

/** Une ligne de la trace ; `ok === false` = erreur surlignée. */
export interface TraceEntry {
  id: number;
  kind: TraceKind;
  atMs: number;
  title: string;
  detail?: string;
  ok?: boolean;
  durationMs?: number;
  /** Identifiant d'appel d'outil, pour rapprocher tool_call_start et tool_call_result. */
  callId?: string;
}

export type Connection = 'connected' | 'disconnected' | 'replay';
export type Outcome = 'harvested' | 'missed' | 'aborted';

export interface EpisodeInfo {
  id: string;
  tomatoId: number;
  startedAtMs: number;
}

export type Counters = Record<Outcome, number>;

export interface BlockFlow {
  from: BlockId;
  to: BlockId;
  label: string;
}

export interface SimClock {
  simTimeS: number;
  timeScale: number;
  paused: boolean;
}

export interface UiState {
  controlsHidden: boolean;
  agentView: boolean;
  diagramOpen: boolean;
  enlarged: CameraId | null;
}

export interface DashboardState {
  connection: Connection;
  phase: Phase;
  phaseAtMs: number | null;
  episode: EpisodeInfo | null;
  counters: Counters;
  /** Plus récent en tête, au plus TRACE_MAX entrées. */
  trace: TraceEntry[];
  nextTraceId: number;
  views: Record<CameraId, ViewImage | null>;
  lastViewsAt: number | null;
  blocks: { active: BlockId | null; flow: BlockFlow | null; atMs: number | null };
  costUsd: number;
  model: string | null;
  sim: SimClock;
  ui: UiState;
}

export type LocalMessage =
  | { type: 'local_connection'; connection: Connection }
  | { type: 'local_reset' }
  | { type: 'local_model'; model: string }
  | { type: 'local_toggle_controls' }
  | { type: 'local_toggle_agent_view' }
  | { type: 'local_toggle_diagram' }
  | { type: 'local_enlarge'; camera: CameraId | null };

export type DashboardMessage = ServerToDashboard | LocalMessage;
