import type { ViewsPayload, ViewsResult, WorldState } from '@tomato/shared';

/** JSON des vues construit depuis un état, sans image (quand la sim ne répond pas). */
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

/** Résultat de vues « vide » : aucune image, JSON de l'état connu. */
export const emptyViews = (state: WorldState): ViewsResult => ({ images: [], json: viewsPayloadOf(state) });
