import { useCallback, useEffect, useState, useSyncExternalStore } from 'react';
import type { CameraId } from '@tomato/shared';
import { setCameraGizmosVisible } from '../cameras/agentCameras';
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
import { TracePanel } from './TracePanel';
import { useWorldClock } from './useWorldClock';
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
 * Mise en page de la spec (section 6) : bandeau haut, gauche 55 % vue spectateur (30 % en mode « ce que voit l'agent »),
 * droite vues puis trace, bandeau bas repliable. Touches : h contrôles, v mode agent, b schéma, c gizmos de caméra.
 */
export function Dashboard({ store, slot, runtime, onSceneReady }: Props) {
  const state = useSyncExternalStore(store.subscribe, store.get);
  const clock = useWorldClock(runtime);
  const detector = useDetectorLabel();
  /** Gizmos de caméra (issue #18) : masqués par défaut, hors du store (état de la scène Three, pas de la sim). */
  const [gizmosVisible, setGizmosVisible] = useState(false);
  const toggleCameraGizmos = useCallback(() => setGizmosVisible((v) => !v), []);
  useEffect(() => setCameraGizmosVisible(gizmosVisible), [gizmosVisible]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (isEditable(e.target) || e.altKey || e.ctrlKey || e.metaKey) return;
      if (e.key === 'h') store.dispatch({ type: 'local_toggle_controls' });
      else if (e.key === 'v') store.dispatch({ type: 'local_toggle_agent_view' });
      else if (e.key === 'b') store.dispatch({ type: 'local_toggle_diagram' });
      else if (e.key === 'c') toggleCameraGizmos();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [store, toggleCameraGizmos]);

  const enlarge = useCallback((camera: CameraId | null) => store.dispatch({ type: 'local_enlarge', camera }), [store]);
  const { ui } = state;
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
      <div className={`grid min-h-0 ${ui.agentView ? 'grid-cols-[30fr_70fr]' : 'grid-cols-[55fr_45fr]'}`}>
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
              >
                <ReplayPanel slot={slot} />
              </Controls>
            </div>
          )}
        </section>
        <aside className="grid min-h-0 grid-rows-[auto_minmax(0,1fr)] border-l border-line">
          <ViewsPanel views={state.views} lastViewsAt={state.lastViewsAt} enlarged={ui.enlarged} onEnlarge={enlarge} />
          <TracePanel trace={state.trace} />
        </aside>
      </div>
      <BlockDiagram flow={state.blocks.flow} atMs={state.blocks.atMs} open={ui.diagramOpen} onToggle={() => store.dispatch({ type: 'local_toggle_diagram' })} />
    </main>
  );
}
