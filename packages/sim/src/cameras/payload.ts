import type { TomatoView, ViewsPayload, WorldState } from '@tomato/shared';

/** Le JSON des vues (spec 4.5) construit depuis l'état du monde. */
export function toViewsPayload(state: WorldState): ViewsPayload {
  const tomatoes: TomatoView[] = state.tomatoes.map((t) => ({
    id: t.id,
    state: t.state,
    ripeness: t.ripeness,
    positionCm: t.positionCm,
    stem: t.stem,
    visibleIn: t.visibleIn,
  }));
  return {
    simTimeS: state.simTimeS,
    phase: state.phase,
    targetTomatoId: state.targetTomatoId,
    tomatoes,
    scissors: state.scissors,
    basket: state.basket,
    cameras: state.cameras,
    limits: state.limits,
  };
}
