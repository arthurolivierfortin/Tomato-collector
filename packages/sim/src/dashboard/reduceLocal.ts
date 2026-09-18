import { advanceQueue } from './blockQueue';
import type { DashboardState, LocalMessage } from './dashboardTypes';
import { initialDashboardState } from './initialState';
import { closedLightbox, normalizeView } from './lightbox';
import { isTraceExpanded } from './traceExpand';

/** Réducteur pur des messages locaux (connexion, replay, interface). `nowMs` sert au rythme du schéma bloc. */
export function reduceLocal(state: DashboardState, m: LocalMessage, nowMs: number): DashboardState {
  switch (m.type) {
    case 'local_connection':
      return state.connection === m.connection ? state : { ...state, connection: m.connection };
    case 'local_reset':
      // Début d'un replay : trace vide, mais les vignettes gardent leur dernière image (issue #22 :
      // les remettre à null les rendait grises jusqu'au premier get_views du replay).
      return {
        ...initialDashboardState(state.model),
        connection: state.connection,
        // `nextTraceId` repart à 1 : garder les replis viserait les entrées du nouvel épisode.
        ui: { ...state.ui, traceOverrides: {} },
        views: state.views,
        viewsAt: state.viewsAt,
        featured: state.featured,
      };
    case 'local_model':
      return state.model === m.model ? state : { ...state, model: m.model };
    case 'local_toggle_controls':
      return { ...state, ui: { ...state.ui, controlsHidden: !state.ui.controlsHidden } };
    case 'local_toggle_agent_view':
      return { ...state, ui: { ...state.ui, agentView: !state.ui.agentView } };
    case 'local_toggle_diagram':
      return { ...state, ui: { ...state.ui, diagramOpen: !state.ui.diagramOpen } };
    case 'local_toggle_session':
      return { ...state, ui: { ...state.ui, sessionOpen: !state.ui.sessionOpen } };
    case 'local_block_advance': {
      // `advanceQueue` rend le même état quand il n'y a rien à faire : le store ne notifie personne.
      const blocks = advanceQueue(state.blocks, nowMs);
      return blocks === state.blocks ? state : { ...state, blocks };
    }
    case 'local_feature':
      return state.featured === m.camera ? state : { ...state, featured: m.camera };
    case 'local_lightbox_open':
      return { ...state, featured: m.camera, ui: { ...state.ui, lightbox: closedLightbox(m.camera) } };
    case 'local_lightbox_close':
      return state.ui.lightbox === null ? state : { ...state, ui: { ...state.ui, lightbox: null } };
    case 'local_lightbox_camera':
      return state.ui.lightbox === null ? state : { ...state, featured: m.camera, ui: { ...state.ui, lightbox: closedLightbox(m.camera) } };
    case 'local_lightbox_view': {
      const open = state.ui.lightbox;
      if (open === null) return state;
      const next = normalizeView({ camera: open.camera, zoom: m.zoom, panXPx: m.panXPx, panYPx: m.panYPx });
      const same = next.zoom === open.zoom && next.panXPx === open.panXPx && next.panYPx === open.panYPx;
      return same ? state : { ...state, ui: { ...state.ui, lightbox: next } };
    }
    case 'local_toggle_trace':
      return { ...state, ui: { ...state.ui, traceOverrides: { ...state.ui.traceOverrides, [m.id]: !isTraceExpanded(state, m.id) } } };
  }
}
