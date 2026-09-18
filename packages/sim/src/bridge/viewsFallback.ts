import type { ViewsPayload, ViewsResult, WorldState } from '@tomato/shared';

/** JSON des vues construit depuis le store, sans image (quand `renderViews` n'est pas disponible ou échoue). */
export function viewsPayloadOf(state: WorldState): ViewsPayload {
  return {
    simTimeS: state.simTimeS,
    phase: state.phase,
    targetTomatoId: state.targetTomatoId,
    tomatoes: state.tomatoes.map((t) => ({
      id: t.id, state: t.state, ripeness: t.ripeness, positionCm: t.positionCm, stem: t.stem, visibleIn: t.visibleIn,
    })),
    scissors: state.scissors,
    basket: state.basket,
    cameras: state.cameras,
    limits: state.limits,
  };
}

export const emptyViews = (state: WorldState): ViewsResult => ({ images: [], json: viewsPayloadOf(state) });
