import type { DashboardState, LocalMessage } from './dashboardTypes';
import { initialDashboardState } from './initialState';

/** Réducteur pur des messages locaux (connexion, replay, interface). */
export function reduceLocal(state: DashboardState, m: LocalMessage): DashboardState {
  switch (m.type) {
    case 'local_connection':
      return state.connection === m.connection ? state : { ...state, connection: m.connection };
    case 'local_reset':
      // Début d'un replay : on repart d'une trace vide en gardant l'interface, le modèle et la connexion.
      return { ...initialDashboardState(state.model), connection: state.connection, ui: state.ui };
    case 'local_model':
      return state.model === m.model ? state : { ...state, model: m.model };
    case 'local_toggle_controls':
      return { ...state, ui: { ...state.ui, controlsHidden: !state.ui.controlsHidden } };
    case 'local_toggle_agent_view':
      return { ...state, ui: { ...state.ui, agentView: !state.ui.agentView } };
    case 'local_toggle_diagram':
      return { ...state, ui: { ...state.ui, diagramOpen: !state.ui.diagramOpen } };
    case 'local_enlarge':
      return state.ui.enlarged === m.camera ? state : { ...state, ui: { ...state.ui, enlarged: m.camera } };
  }
}
