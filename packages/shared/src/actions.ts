import type { CameraId, WorldState } from './world';

export type MoveMode = 'relative' | 'absolute';

export type SimAction =
  | { type: 'move_camera'; camera: CameraId; dx?: number; dy?: number; dz?: number; yaw?: number; tilt?: number; zoom?: number }
  | { type: 'move_scissors'; x: number; y: number; z: number; mode: MoveMode }
  | { type: 'rotate_scissors'; yaw?: number; pitch?: number; roll?: number; mode: MoveMode }
  | { type: 'open_scissors' }
  | { type: 'cut' }
  | { type: 'move_basket'; x: number; y: number; mode: MoveMode }
  | { type: 'set_target'; tomatoId: number | null }
  | { type: 'set_time_scale'; scale: number }
  | { type: 'set_paused'; paused: boolean }
  | { type: 'ripen_next' }
  | { type: 'new_plant'; seed?: number };

export type ActionErrorCode =
  | 'out_of_reach'
  | 'collision'
  | 'out_of_rail'
  | 'nothing_between_blades'
  | 'leaf_cut'
  | 'misaligned'
  | 'invalid_argument'
  | 'not_available';

export type ActionResult =
  | { ok: true; message: string; state: WorldState }
  | { ok: false; error: ActionErrorCode; message: string; details?: Record<string, number | string>; state: WorldState };

export function ok(state: WorldState, message: string): ActionResult {
  return { ok: true, message, state };
}

export function fail(
  state: WorldState,
  error: ActionErrorCode,
  message: string,
  details?: Record<string, number | string>,
): ActionResult {
  return details === undefined ? { ok: false, error, message, state } : { ok: false, error, message, details, state };
}
