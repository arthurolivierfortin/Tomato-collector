import { useEffect } from 'react';
import type { DashboardStore } from './dashboardStore';

function isEditable(target: EventTarget | null): boolean {
  return target instanceof HTMLElement && (target.tagName === 'INPUT' || target.tagName === 'SELECT' || target.tagName === 'TEXTAREA' || target.isContentEditable);
}

/**
 * Raccourcis de tournage : `h` contrôles, `v` mode « ce que voit l'agent », `b` schéma bloc,
 * `c` gizmos de caméra, `z` loupe plein écran, `t` panneau « Session agent (brut) » (issue #23),
 * `p` panneau « Perception », `x` mode « Pipeline de traitement » plein écran (issue #36).
 */
export function useDashboardKeys(store: DashboardStore, toggleCameraGizmos: () => void, lightboxOpen: boolean, pipelineOpen: boolean): void {
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (isEditable(e.target) || e.altKey || e.ctrlKey || e.metaKey) return;
      if (e.key === 'h') store.dispatch({ type: 'local_toggle_controls' });
      else if (e.key === 'v') store.dispatch({ type: 'local_toggle_agent_view' });
      else if (e.key === 'b') store.dispatch({ type: 'local_toggle_diagram' });
      else if (e.key === 't') store.dispatch({ type: 'local_toggle_session' });
      else if (e.key === 'p') store.dispatch({ type: 'local_toggle_perception' });
      else if (e.key === 'c') toggleCameraGizmos();
      else if (e.key === 'x') {
        // La loupe est au même niveau que le pipeline : on la ferme avant, sinon elle reste dessous.
        if (lightboxOpen) store.dispatch({ type: 'local_lightbox_close' });
        store.dispatch(pipelineOpen ? { type: 'local_pipeline_close' } : { type: 'local_pipeline_open', camera: store.get().featured });
      }
      else if (e.key === 'z') store.dispatch(lightboxOpen ? { type: 'local_lightbox_close' } : { type: 'local_lightbox_open', camera: store.get().featured });
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [store, toggleCameraGizmos, lightboxOpen, pipelineOpen]);
}
