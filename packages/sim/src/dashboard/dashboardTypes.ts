import type { BlockId, CameraId, Phase, ServerToDashboard, ViewImage } from '@tomato/shared';
import type { LightboxView } from './lightbox';

export type TraceKind = 'text' | 'tool' | 'event' | 'phase';

/** Une ligne de la trace ; `ok === false` = erreur surlignée, `ok === undefined` sur un outil = appel en cours. */
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
  /** Nom de l'outil appelé (entrées `tool` issues d'un `tool_call_start`). */
  tool?: string;
  /** Arguments complets de l'appel, affichés en JSON. */
  args?: Record<string, unknown>;
  /** Résultat structuré renvoyé par le serveur (`tool_call_result.result`), sans image. */
  result?: unknown;
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
  /** Loupe plein écran ouverte sur une vue, avec son zoom et son déplacement ; null = fermée. */
  lightbox: LightboxView | null;
  /** Repli/dépli explicite d'une entrée de trace, par identifiant ; absent = état par défaut. */
  traceOverrides: Record<number, boolean>;
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
  /** Horodatage de réception de chaque vue, pour afficher son âge (« il y a 3 s »). */
  viewsAt: Record<CameraId, number | null>;
  /** Vue mise en avant en grand : la dernière demandée par l'agent, `front` par défaut. */
  featured: CameraId;
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
  /** Clic sur une vignette : elle passe en grand. */
  | { type: 'local_feature'; camera: CameraId }
  | { type: 'local_lightbox_open'; camera: CameraId }
  | { type: 'local_lightbox_close' }
  | { type: 'local_lightbox_camera'; camera: CameraId }
  | { type: 'local_lightbox_view'; zoom: number; panXPx: number; panYPx: number }
  | { type: 'local_toggle_trace'; id: number };

export type DashboardMessage = ServerToDashboard | LocalMessage;
