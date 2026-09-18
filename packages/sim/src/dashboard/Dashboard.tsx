import { useCallback, useEffect, useState, useSyncExternalStore } from 'react';
import type { CameraId } from '@tomato/shared';
import { setCameraGizmosVisible } from '../cameras/agentCameras';
import { subscribeViews } from '../cameras/cameraModule';
import type { SimRuntime } from '../core/runtime';
import { PerceptionBadge } from '../perception/PerceptionBadge';
import type { SceneHandle } from '../three/createScene';
import { SpectatorView } from '../three/SpectatorView';
import { BlockDiagram } from './BlockDiagram';
import type { BridgeSlot } from './bridgeSlot';
import { Controls } from './Controls';
import type { DashboardStore } from './dashboardStore';
import { detectorLabel, loadPerceptionState, type PerceptionReader } from './perceptionInfo';
import { ReplayPanel } from './ReplayPanel';
import { StatusBar } from './StatusBar';
import { isTraceExpanded } from './traceExpand';
import { TracePanel } from './TracePanel';
import { useWorldClock } from './useWorldClock';
import { ViewLightbox } from './ViewLightbox';
import { ViewsPanel } from './ViewsPanel';

/** Période de relecture de `perceptionState()` (M4) pour le bandeau. */
const DETECTOR_POLL_MS = 500;

function isEditable(target: EventTarget | null): boolean {
  return target instanceof HTMLElement && (target.tagName === 'INPUT' || target.tagName === 'SELECT' || target.tagName === 'TEXTAREA' || target.isContentEditable);
}

function useDetectorLabel(): string {
  const [label, setLabel] = useState(detectorLabel(null));
  useEffect(() => {
    let read: PerceptionReader | null = null;
    let cancelled = false;
    void loadPerceptionState().then((fn) => {
      if (!cancelled) read = fn;
    });
    const timer = setInterval(() => setLabel(detectorLabel(read ? read() : null)), DETECTOR_POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, []);
  return label;
}

interface Props {
  store: DashboardStore;
  slot: BridgeSlot;
  runtime: SimRuntime | null;
  onSceneReady: (scene: SceneHandle) => void | (() => void);
}

/**
 * Mise en page (spec section 6, revue par l'issue #22) : bandeau haut, puis trois colonnes — vue
 * spectateur, trace de l'agent, et à droite la colonne des vues (celle demandée en dernier par l'agent
 * en grand, les deux autres en vignettes dessous). En mode « ce que voit l'agent » (`v`) la trace
 * s'efface et les trois vues passent en grand. Touches : h contrôles, v mode agent, b schéma,
 * c gizmos de caméra, z loupe plein écran sur la vue mise en avant.
 */
export function Dashboard({ store, slot, runtime, onSceneReady }: Props) {
  const state = useSyncExternalStore(store.subscribe, store.get);
  const clock = useWorldClock(runtime);
  const detector = useDetectorLabel();
  /** Gizmos de caméra (issue #18) : masqués par défaut, hors du store (état de la scène Three, pas de la sim). */
  const [gizmosVisible, setGizmosVisible] = useState(false);
  const toggleCameraGizmos = useCallback(() => setGizmosVisible((v) => !v), []);
  useEffect(() => setCameraGizmosVisible(gizmosVisible), [gizmosVisible]);

  const feature = useCallback((camera: CameraId) => store.dispatch({ type: 'local_feature', camera }), [store]);
  const openLightbox = useCallback((camera: CameraId) => store.dispatch({ type: 'local_lightbox_open', camera }), [store]);
  const closeLightbox = useCallback(() => store.dispatch({ type: 'local_lightbox_close' }), [store]);
  const lightboxCamera = useCallback((camera: CameraId) => store.dispatch({ type: 'local_lightbox_camera', camera }), [store]);
  const lightboxView = useCallback(
    (view: { zoom: number; panXPx: number; panYPx: number }) => store.dispatch({ type: 'local_lightbox_view', zoom: view.zoom, panXPx: view.panXPx, panYPx: view.panYPx }),
    [store],
  );
  const toggleTrace = useCallback((id: number) => store.dispatch({ type: 'local_toggle_trace', id }), [store]);
  const expanded = useCallback((id: number) => isTraceExpanded(store.get(), id), [store]);

  const { ui } = state;
  const lightboxOpen = ui.lightbox !== null;
  /** Page seule (sans serveur ni replay) : le rendu local de M3 alimente le panneau ; connecté, c'est l'agent. */
  const standalone = state.connection === 'disconnected';

  useEffect(
    () =>
      subscribeViews((result) => {
        if (store.get().connection === 'disconnected') store.dispatch({ type: 'views', episodeId: null, result });
      }),
    [store],
  );

  const refresh = useCallback(() => {
    void window.__tomato?.renderViews?.(['top', 'front', 'side']);
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (isEditable(e.target) || e.altKey || e.ctrlKey || e.metaKey) return;
      if (e.key === 'h') store.dispatch({ type: 'local_toggle_controls' });
      else if (e.key === 'v') store.dispatch({ type: 'local_toggle_agent_view' });
      else if (e.key === 'b') store.dispatch({ type: 'local_toggle_diagram' });
      else if (e.key === 'c') toggleCameraGizmos();
      else if (e.key === 'z') store.dispatch(lightboxOpen ? { type: 'local_lightbox_close' } : { type: 'local_lightbox_open', camera: store.get().featured });
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [store, toggleCameraGizmos, lightboxOpen]);

  const sim = clock ?? state.sim;

  return (
    <main data-testid="dashboard" data-layout={ui.agentView ? 'agent' : 'normal'} className="grid h-full w-full grid-rows-[auto_minmax(0,1fr)_auto] bg-panel text-ink">
      <div className="shrink-0">
        <StatusBar state={state} clock={clock} detector={detector} />
        {/* Pastille de perception de M4 : contours actifs, modèle, dernier détecteur (data-testid="perception-badge"). */}
        <div className="border-b border-line bg-panel-2 px-4 pt-2">
          <PerceptionBadge />
        </div>
      </div>
      <div className={`grid min-h-0 ${ui.agentView ? 'grid-cols-[22rem_minmax(0,1fr)]' : 'grid-cols-[minmax(0,1fr)_minmax(22rem,30rem)_40rem]'}`}>
        <section aria-label="Vue spectateur" className="relative min-h-0">
          <SpectatorView onReady={onSceneReady} />
          <div className="absolute left-3 top-3 text-[12px] text-ink-dim">Vue spectateur</div>
          {!ui.controlsHidden && (
            <div className="absolute bottom-3 left-3 right-3">
              <Controls
                runtime={runtime}
                paused={sim.paused}
                timeScale={sim.timeScale}
                agentView={ui.agentView}
                cameraGizmosVisible={gizmosVisible}
                onToggleControls={() => store.dispatch({ type: 'local_toggle_controls' })}
                onToggleAgentView={() => store.dispatch({ type: 'local_toggle_agent_view' })}
                onToggleCameraGizmos={toggleCameraGizmos}
                onOpenLightbox={() => openLightbox(state.featured)}
              >
                <ReplayPanel slot={slot} />
              </Controls>
            </div>
          )}
        </section>
        {!ui.agentView && <TracePanel trace={state.trace} isExpanded={expanded} onToggle={toggleTrace} />}
        <ViewsPanel
          views={state.views}
          viewsAt={state.viewsAt}
          featured={state.featured}
          lastViewsAt={state.lastViewsAt}
          agentView={ui.agentView}
          onFeature={feature}
          onOpen={openLightbox}
          {...(standalone ? { onRefresh: refresh } : {})}
        />
      </div>
      <BlockDiagram flow={state.blocks.flow} atMs={state.blocks.atMs} open={ui.diagramOpen} onToggle={() => store.dispatch({ type: 'local_toggle_diagram' })} />
      {ui.lightbox && (
        <ViewLightbox view={ui.lightbox} views={state.views} onClose={closeLightbox} onCamera={lightboxCamera} onView={lightboxView} />
      )}
    </main>
  );
}
