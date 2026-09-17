import { VIEW_SIZE_PX, fail, ok, type ActionResult, type CameraPose, type SimAction, type Vec2, type Vec3, type WorldState } from '@tomato/shared';

export type MoveCameraAction = Extract<SimAction, { type: 'move_camera' }>;

/** Largeur de champ admissible après zoom, en cm. */
export const WIDTH_RANGE_CM: Vec2 = [20, 200];

const clamp = (v: number, range: Vec2): number => Math.min(range[1], Math.max(range[0], v));

/** Reducer pur de `move_camera` : rails, pivot borné, zoom ; erreurs structurées, jamais d'exception. */
export function moveCamera(state: WorldState, action: MoveCameraAction): ActionResult {
  const id = action.camera;
  const cam = state.cameras[id];
  const rail = state.limits.cameraRailsCm[id];
  if (action.zoom !== undefined && !(action.zoom > 0)) {
    return fail(state, 'invalid_argument', `zoom must be > 0 (got ${action.zoom})`, { zoom: action.zoom });
  }
  const target: Vec3 = [
    cam.positionCm[0] + (action.dx ?? 0),
    cam.positionCm[1] + (action.dy ?? 0),
    cam.positionCm[2] + (action.dz ?? 0),
  ];
  const checks: readonly (readonly [string, number, Vec2])[] = [['x', target[0], rail.x], ['y', target[1], rail.y], ['z', target[2], rail.z]];
  for (const [axis, value, [minCm, maxCm]] of checks) {
    if (value < minCm || value > maxCm) {
      return fail(
        state,
        'out_of_rail',
        `camera ${id}: ${axis} = ${value.toFixed(1)} cm is outside its rail [${minCm}, ${maxCm}] cm`,
        { axis, requestedCm: value, minCm, maxCm },
      );
    }
  }
  const pivot = state.limits.cameraPivotDeg;
  const pivotRange: Vec2 = [-pivot, pivot];
  const wantedYaw = cam.yawDeg + (action.yaw ?? 0);
  const wantedTilt = cam.tiltDeg + (action.tilt ?? 0);
  const yawDeg = clamp(wantedYaw, pivotRange);
  const tiltDeg = clamp(wantedTilt, pivotRange);
  const widthCm = clamp(cam.widthCm / (action.zoom ?? 1), WIDTH_RANGE_CM);
  const next: CameraPose = { positionCm: target, yawDeg, tiltDeg, widthCm, pxPerCm: VIEW_SIZE_PX / widthCm };
  const clampedNote = yawDeg !== wantedYaw || tiltDeg !== wantedTilt ? ` (pivot clamped to ±${pivot}°)` : '';
  const [x, y, z] = target;
  return ok(
    { ...state, cameras: { ...state.cameras, [id]: next } },
    `camera ${id} at (${x.toFixed(1)}, ${y.toFixed(1)}, ${z.toFixed(1)}) cm, yaw ${yawDeg.toFixed(1)}°, tilt ${tiltDeg.toFixed(1)}°, field ${widthCm.toFixed(1)} cm (${next.pxPerCm.toFixed(2)} px/cm)${clampedNote}`,
  );
}
