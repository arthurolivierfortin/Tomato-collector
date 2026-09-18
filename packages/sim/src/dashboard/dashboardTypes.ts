import type { BlockId, CameraId, Phase, ServerToDashboard, ViewImage, WakeDetector } from '@tomato/shared';
import type { BlockQueue } from './blockQueue';
import type { LightboxView } from './lightbox';
import type { RawLine } from './rawLines';
import type { Ripening } from './ripening';

/** `wake` = la détection qui a réveillé l'agent, sur-lignée dans la trace (issue #23). */
export type TraceKind = 'text' | 'tool' | 'event' | 'phase' | 'wake';

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

/** Dernier réveil de l'agent : bandeau bref et ligne sur-lignée de la trace. */
export interface WakeInfo {
  tomatoId: number;
  detector: WakeDetector;
  confidence: number;
  sessionResumed: boolean;
  atMs: number;
}

export interface UiState {
  controlsHidden: boolean;
  agentView: boolean;
  diagramOpen: boolean;
  /** Panneau « Session agent (brut) » déplié (touche `t`). */
  sessionOpen: boolean;
  /** Panneau « Perception » déplié (touche `p`, issue #36). */
  perceptionOpen: boolean;
  /** Mode « Pipeline de traitement » plein écran sur une caméra (touche `x`) ; null = fermé. */
  pipelineCamera: CameraId | null;
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
  /** Flux brut de la session agent, plus ancien en haut, au plus RAW_MAX lignes. */
  raw: RawLine[];
  nextRawId: number;
  /** Épisode auquel appartient le tampon `raw` : il repart à vide quand l'épisode change. */
  rawEpisodeId: string | null;
  /** Instant du réveil, origine des horodatages relatifs du panneau. */
  rawSinceMs: number | null;
  wake: WakeInfo | null;
  /** Tomate en cours de mûrissement, d'après le dernier snapshot. */
  ripening: Ripening | null;
  /** File des activités du schéma bloc : une à la fois, au moins BLOCK_MIN_MS chacune. */
  blocks: BlockQueue;
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
  | { type: 'local_toggle_session' }
  | { type: 'local_toggle_perception' }
  | { type: 'local_pipeline_open'; camera: CameraId }
  | { type: 'local_pipeline_close' }
  /** Battement du schéma bloc : fait avancer la file quand l'activité en cours a tenu sa durée. */
  | { type: 'local_block_advance' }
  /** Clic sur une vignette : elle passe en grand. */
  | { type: 'local_feature'; camera: CameraId }
  | { type: 'local_lightbox_open'; camera: CameraId }
  | { type: 'local_lightbox_close' }
  | { type: 'local_lightbox_camera'; camera: CameraId }
  | { type: 'local_lightbox_view'; zoom: number; panXPx: number; panYPx: number }
  | { type: 'local_toggle_trace'; id: number };

export type DashboardMessage = ServerToDashboard | LocalMessage;
