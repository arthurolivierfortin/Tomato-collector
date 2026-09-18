import type { ReactNode } from 'react';
import type { SimAction } from '@tomato/shared';
import type { SimRuntime } from '../core/runtime';
import { BTN } from './ui';

/** Facteurs de vitesse proposés (spec section 6 : pause, vitesse). */
export const SPEEDS = [1, 2, 5, 10] as const;

interface Props {
  /** null tant que la sim n'est pas prête : les actions locales sont alors désactivées. */
  runtime: SimRuntime | null;
  paused: boolean;
  timeScale: number;
  agentView: boolean;
  cameraGizmosVisible: boolean;
  /** Panneau « Session agent (brut) » déplié (issue #23). */
  sessionOpen: boolean;
  onToggleControls: () => void;
  onToggleAgentView: () => void;
  onToggleCameraGizmos: () => void;
  onToggleSession: () => void;
  /** Ouvre la loupe plein écran sur la vue mise en avant (touche z). */
  onOpenLightbox: () => void;
  /** Le panneau de replay, rendu dans la même barre. */
  children?: ReactNode;
}

/** Contrôles de tournage : agissent sur la sim locale via `runtime.applyNow` (immédiat, aucun passage par le serveur). */
export function Controls({
  runtime, paused, timeScale, agentView, cameraGizmosVisible, sessionOpen,
  onToggleControls, onToggleAgentView, onToggleCameraGizmos, onToggleSession, onOpenLightbox, children,
}: Props) {
  const off = runtime === null;
  // Contrôles de tournage : effet immédiat attendu (pause, vitesse, plant) — jamais l'animation de `apply`.
  const apply = (action: SimAction): void => {
    runtime?.applyNow(action);
  };
  return (
    <div data-testid="controls" role="toolbar" aria-label="Contrôles de tournage" className="flex flex-wrap items-center gap-2 rounded-sm border border-line bg-panel-2/90 p-2">
      <button type="button" className={BTN} disabled={off} aria-pressed={paused} onClick={() => apply({ type: 'set_paused', paused: !paused })}>
        {paused ? 'Reprendre' : 'Pause'}
      </button>
      <div role="group" aria-label="Vitesse" className="flex items-center gap-1">
        {SPEEDS.map((s) => (
          <button key={s} type="button" className={`${BTN} font-mono`} disabled={off} aria-pressed={timeScale === s} onClick={() => apply({ type: 'set_time_scale', scale: s })}>
            ×{s}
          </button>
        ))}
      </div>
      <button type="button" className={BTN} disabled={off} onClick={() => apply({ type: 'ripen_next' })}>
        Mûrir la prochaine tomate
      </button>
      <button type="button" className={BTN} disabled={off} onClick={() => apply({ type: 'new_plant' })}>
        Nouveau plant
      </button>
      {children}
      <button type="button" className={BTN} aria-pressed={agentView} onClick={onToggleAgentView}>
        Ce que voit l&apos;agent (v)
      </button>
      <button type="button" className={BTN} aria-pressed={cameraGizmosVisible} onClick={onToggleCameraGizmos}>
        Caméras (c)
      </button>
      <button type="button" className={BTN} onClick={onOpenLightbox}>
        Zoomer la vue (z)
      </button>
      <button type="button" className={BTN} aria-pressed={sessionOpen} onClick={onToggleSession}>
        Session brute (t)
      </button>
      <button type="button" className={BTN} onClick={onToggleControls}>
        Masquer les contrôles (h)
      </button>
    </div>
  );
}
