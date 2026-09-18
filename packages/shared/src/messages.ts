import type { ActionResult, SimAction } from './actions';
import type { Phase } from './phases';
import type { ViewsResult } from './views';
import type { CameraId, WorldState } from './world';

export type ClientRole = 'sim' | 'dashboard';

export interface ClientHello {
  type: 'hello';
  role: ClientRole;
}

export type DetectorKind = 'yolo' | 'hsv';

export type SimEvent =
  | { type: 'ripe_detected'; tomatoId: number; detector: DetectorKind; confidence: number }
  | { type: 'tomato_landed'; tomatoId: number; inBasket: boolean }
  | { type: 'plant_regenerated'; seed: number };

/** Navigateur (rôle sim) → serveur. */
export type SimToServer =
  | ClientHello
  | { type: 'state'; state: WorldState }
  | { type: 'sim_event'; event: SimEvent }
  | { type: 'action_result'; requestId: string; result: ActionResult }
  | { type: 'views_result'; requestId: string; result: ViewsResult };

/** Serveur → navigateur (rôle sim). */
export type ServerToSim =
  | { type: 'apply_action'; requestId: string; action: SimAction }
  | { type: 'render_views'; requestId: string; cameras: CameraId[] };

export type BlockId = 'simulation' | 'perception' | 'server' | 'agent' | 'dashboard';

/** Nature d'une ligne du flux brut de la session agent (`agent_raw`, issue #23). */
export type AgentRawKind = 'init' | 'text' | 'tool_use' | 'tool_result' | 'result' | 'stderr';

/** Origine d'un réveil : un détecteur de la perception, ou la main (`npm run wake`). */
export type WakeDetector = DetectorKind | 'manual';

/** Serveur → dashboard (et vers la page sim, qui est aussi le dashboard). */
export type ServerToDashboard =
  | { type: 'snapshot'; state: WorldState; phase: Phase; episodeId: string | null }
  | { type: 'phase'; phase: Phase; reason: string }
  | { type: 'episode_start'; episodeId: string; tomatoId: number; sessionResumed: boolean }
  | { type: 'episode_end'; episodeId: string; outcome: 'harvested' | 'missed' | 'aborted'; note: string; toolCalls: number; costUsd: number; durationMs: number }
  | { type: 'agent_text'; episodeId: string; text: string }
  | { type: 'tool_call_start'; episodeId: string; callId: string; tool: string; args: Record<string, unknown> }
  /** `result` : résultat structuré sans image (issue #22) ; absent des journaux antérieurs. */
  | { type: 'tool_call_result'; episodeId: string; callId: string; ok: boolean; summary: string; durationMs: number; result?: unknown }
  | { type: 'views'; episodeId: string | null; result: ViewsResult }
  | { type: 'sim_event'; event: SimEvent }
  | { type: 'block_activity'; from: BlockId; to: BlockId; label: string }
  // Ajouts de l'issue #23, en FIN d'union : flux brut de la session agent et réveil explicite.
  | { type: 'agent_raw'; episodeId: string; kind: AgentRawKind; line: string }
  | { type: 'agent_wake'; episodeId: string; tomatoId: number; detector: WakeDetector; confidence: number; sessionResumed: boolean };

export type AnyMessage = SimToServer | ServerToSim | ServerToDashboard;

/** Décode un message brut ; retourne null si ce n'est pas un objet JSON avec un `type` string. */
export function parseMessage(raw: string): AnyMessage | null {
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return null;
  }
  if (typeof value !== 'object' || value === null) return null;
  const type = (value as { type?: unknown }).type;
  if (typeof type !== 'string') return null;
  return value as AnyMessage;
}
