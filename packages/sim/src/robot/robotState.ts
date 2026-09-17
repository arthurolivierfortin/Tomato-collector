import { fail, ok, vadd, vscale, vsub } from '@tomato/shared';
import type { ActionResult, MoveMode, Vec3, WorldState } from '@tomato/shared';
import { pathBlocked } from './collision';
import type { TomatoObstacle } from './collision';
import { CUT_MAX_NORMAL_ANGLE_DEG, CUT_TOLERANCE_CM, NEAR_CM, evaluateCut } from './cutRule';
import type { LeafObstacle } from './cutRule';
import { solveIk } from './ik';
import { MIN_Z_CM, distanceFromBase, isReachable } from './reach';
import { BLADE_LENGTH_CM, OPENING_DEG, poseFromAngles } from './scissorsGeometry';

export interface PlantObstacles {
  tomatoes: TomatoObstacle[];
  mainStem: Vec3[];
  stemRadiusCm: number;
}

export interface CutCommand {
  result: ActionResult;
  cutTomatoId: number | null;
}

const r2 = (n: number): number => Math.round(n * 100) / 100;
const allFinite = (ns: number[]): boolean => ns.every((n) => Number.isFinite(n));
/** Ramène un angle dans [-180, 180). */
export const wrapDeg = (d: number): number => ((((d + 180) % 360) + 360) % 360) - 180;
const pivotOf = (cutPointCm: Vec3, bladeAxis: Vec3): Vec3 => vsub(cutPointCm, vscale(bladeAxis, BLADE_LENGTH_CM / 2));
const fmt = (v: Vec3): string => `(${r2(v[0])}, ${r2(v[1])}, ${r2(v[2])})`;

export function moveScissors(
  state: WorldState,
  x: number,
  y: number,
  z: number,
  mode: MoveMode,
  plant: PlantObstacles,
): ActionResult {
  if (!allFinite([x, y, z])) return fail(state, 'invalid_argument', 'x, y, z must be finite numbers in cm');
  const from = state.scissors.cutPointCm;
  const target: Vec3 = mode === 'absolute' ? [x, y, z] : vadd(from, [x, y, z]);
  const { scissorsBaseCm: base, scissorsReachCm: reach } = state.limits;
  const at = { x: r2(target[0]), y: r2(target[1]), z: r2(target[2]) };
  if (!isReachable(base, reach, target)) {
    return fail(
      state,
      'out_of_reach',
      `cut point ${fmt(target)} cm is beyond the arm: distance from base ${fmt(base)} must be <= ${reach} cm and z >= ${MIN_Z_CM} cm; scissors did not move`,
      { ...at, distanceCm: r2(distanceFromBase(base, target)), reachCm: reach, minZCm: MIN_Z_CM },
    );
  }
  if (solveIk(base, pivotOf(target, state.scissors.bladeAxis)) === null) {
    return fail(state, 'out_of_reach', `scissors pivot for ${fmt(target)} cm is beyond the arm links; scissors did not move`, { ...at, reachCm: reach });
  }
  const hit = pathBlocked(from, target, plant.tomatoes, plant.mainStem, plant.stemRadiusCm);
  if (hit.blocked) {
    const what = hit.what === 'tomato' ? `tomato ${hit.id ?? '?'}` : 'the main stem';
    const idDetail = hit.id === undefined ? {} : { tomatoId: hit.id };
    return fail(
      state,
      'collision',
      `path to ${fmt(target)} cm crosses ${what} at ${fmt(hit.atCm)} cm; scissors did not move`,
      { ...at, blockedBy: hit.what, ...idDetail, atX: r2(hit.atCm[0]), atY: r2(hit.atCm[1]), atZ: r2(hit.atCm[2]) },
    );
  }
  const next: WorldState = { ...state, scissors: { ...state.scissors, cutPointCm: target } };
  return ok(next, `scissors cut point at ${fmt(target)} cm`);
}

export function rotateScissors(
  state: WorldState,
  yaw: number | undefined,
  pitch: number | undefined,
  roll: number | undefined,
  mode: MoveMode,
): ActionResult {
  const given = [yaw, pitch, roll].filter((v): v is number => v !== undefined);
  if (given.length === 0) return fail(state, 'invalid_argument', 'give at least one of yaw, pitch, roll (degrees)');
  if (!allFinite(given)) return fail(state, 'invalid_argument', 'yaw, pitch, roll must be finite numbers in degrees');
  const s = state.scissors;
  const combine = (current: number, value: number | undefined): number =>
    wrapDeg(mode === 'absolute' ? (value ?? current) : current + (value ?? 0));
  const pose = poseFromAngles(s.cutPointCm, combine(s.yawDeg, yaw), combine(s.pitchDeg, pitch), combine(s.rollDeg, roll), s.openingDeg);
  const angles = { yawDeg: r2(pose.yawDeg), pitchDeg: r2(pose.pitchDeg), rollDeg: r2(pose.rollDeg) };
  if (solveIk(state.limits.scissorsBaseCm, pivotOf(pose.cutPointCm, pose.bladeAxis)) === null) {
    return fail(state, 'out_of_reach', 'this orientation puts the scissors pivot beyond the arm links; scissors did not rotate', angles);
  }
  return ok({ ...state, scissors: pose }, `scissors yaw ${angles.yawDeg}°, pitch ${angles.pitchDeg}°, roll ${angles.rollDeg}°`);
}

export function openScissors(state: WorldState): ActionResult {
  return ok({ ...state, scissors: { ...state.scissors, openingDeg: OPENING_DEG } }, `scissors open ${OPENING_DEG}°`);
}

/** Ferme les lames : coupe la tige cible si la règle de coupe est satisfaite, sinon explique pourquoi. */
export function closeAndCut(state: WorldState, leaves: LeafObstacle[]): CutCommand {
  if (state.scissors.openingDeg <= 0) {
    return {
      result: fail(state, 'nothing_between_blades', 'blades are already closed: call open_scissors, approach the stem, then cut'),
      cutTomatoId: null,
    };
  }
  const stems = state.tomatoes.filter((t) => t.attached).map((t) => ({ id: t.id, fromCm: t.stem.fromCm, toCm: t.stem.toCm }));
  const ev = evaluateCut(state.scissors, stems, leaves, state.targetTomatoId);
  const details: Record<string, number> = { angleDeg: r2(ev.angleDeg) };
  if (Number.isFinite(ev.distanceCm)) details.distanceCm = r2(ev.distanceCm);
  if (ev.tomatoId !== null) details.tomatoId = ev.tomatoId;
  switch (ev.result) {
    case 'stem_cut':
      return {
        result: ok(
          { ...state, scissors: { ...state.scissors, openingDeg: 0 } },
          `stem_cut: pedicel of tomato ${ev.tomatoId} cut (${r2(ev.distanceCm)} cm from the cut point, ${r2(ev.angleDeg)}° from the blade normal); blades closed`,
        ),
        cutTomatoId: ev.tomatoId,
      };
    case 'misaligned':
      return {
        result: fail(
          state,
          'misaligned',
          `misaligned: the target stem is ${r2(ev.distanceCm)} cm from the cut point (max ${CUT_TOLERANCE_CM}) and ${r2(ev.angleDeg)}° from the blade normal (must be < ${CUT_MAX_NORMAL_ANGLE_DEG}°); nothing cut, blades still open`,
          details,
        ),
        cutTomatoId: null,
      };
    case 'leaf_cut':
      return {
        result: fail(state, 'leaf_cut', `leaf_cut: only a leaf is between the blades, no stem within ${NEAR_CM} cm of the cut point; blades still open`, details),
        cutTomatoId: null,
      };
    default:
      return {
        result: fail(state, 'nothing_between_blades', `nothing_between_blades: no stem or leaf within ${NEAR_CM} cm of the cut point; blades still open`, details),
        cutTomatoId: null,
      };
  }
}

export function moveBasket(state: WorldState, x: number, y: number, mode: MoveMode): ActionResult {
  if (!allFinite([x, y])) return fail(state, 'invalid_argument', 'x, y must be finite numbers in cm');
  const [cx, cy, cz] = state.basket.centerCm;
  const tx = mode === 'absolute' ? x : cx + x;
  const ty = mode === 'absolute' ? y : cy + y;
  const rail = state.limits.basketRailCm;
  if (tx < rail.x[0] || tx > rail.x[1] || ty < rail.y[0] || ty > rail.y[1]) {
    return fail(
      state,
      'out_of_rail',
      `basket centre (${r2(tx)}, ${r2(ty)}) cm is off the rail x in [${rail.x[0]}, ${rail.x[1]}], y in [${rail.y[0]}, ${rail.y[1]}] cm; basket did not move`,
      { x: r2(tx), y: r2(ty), railXMin: rail.x[0], railXMax: rail.x[1], railYMin: rail.y[0], railYMax: rail.y[1] },
    );
  }
  return ok({ ...state, basket: { ...state.basket, centerCm: [tx, ty, cz] } }, `basket centre at (${r2(tx)}, ${r2(ty)}) cm`);
}
