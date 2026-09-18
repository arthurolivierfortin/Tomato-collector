import { useEffect } from 'react';
import { CAMERA_IDS, type CameraId, type ViewImage } from '@tomato/shared';
import { AgentViews } from '../cameras/AgentViews';
import { BTN } from './ui';
import { useFlash } from './useFlash';

/** Durée du flash du cadre à chaque message `views`. */
export const VIEWS_FLASH_MS = 400;

const CAMERA_AXES: Record<CameraId, string> = { top: 'X → droite, Y → haut', front: 'X → droite, Z → haut', side: 'Y → droite, Z → haut' };

interface Props {
  views: Record<CameraId, ViewImage | null>;
  lastViewsAt: number | null;
  enlarged: CameraId | null;
  onEnlarge: (camera: CameraId | null) => void;
}

/**
 * « Ce que voit l'agent ». Tant qu'aucun message `views` n'est arrivé (page seule, sans serveur ni replay),
 * le composant `AgentViews` de M3 est affiché tel quel (rendu local + bouton « Rafraîchir les vues »).
 * Dès qu'un pont fournit des vues, elles sont affichées telles que reçues par l'agent, clic pour agrandir.
 */
export function ViewsPanel({ views, lastViewsAt, enlarged, onEnlarge }: Props) {
  const flash = useFlash(lastViewsAt, VIEWS_FLASH_MS);
  const fromBridge = CAMERA_IDS.some((id) => views[id] !== null);

  useEffect(() => {
    if (enlarged === null) return;
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onEnlarge(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [enlarged, onEnlarge]);

  const big = enlarged === null ? null : views[enlarged];

  return (
    <section data-testid="views" data-flash={flash ? 'true' : undefined} aria-label="Ce que voit l'agent" className={`shrink-0 border-b border-line p-3 ${flash ? 'views-flash' : ''}`}>
      {fromBridge ? (
        <div className="grid grid-cols-3 gap-2">
          {CAMERA_IDS.map((id) => {
            const img = views[id];
            return (
              <figure key={id} className="flex flex-col gap-1">
                {img ? (
                  <button type="button" aria-label={`Agrandir la vue ${id}`} onClick={() => onEnlarge(id)} className="block w-full focus-visible:outline focus-visible:outline-stem">
                    <img alt={`vue ${id}`} src={`data:image/png;base64,${img.pngBase64}`} className="aspect-square w-full bg-black" />
                  </button>
                ) : (
                  <div className="aspect-square w-full bg-panel-2" />
                )}
                <figcaption className="text-[11px] text-ink-dim">
                  <span className="text-ink">{id}</span> {CAMERA_AXES[id]}
                </figcaption>
              </figure>
            );
          })}
        </div>
      ) : (
        <AgentViews />
      )}
      {big && enlarged && (
        <div role="dialog" aria-modal="true" aria-label={`Vue ${enlarged} agrandie`} className="fixed inset-0 z-50 flex items-center justify-center bg-black/85" onClick={() => onEnlarge(null)}>
          <img alt={`vue ${enlarged} agrandie`} src={`data:image/png;base64,${big.pngBase64}`} className="max-h-[96vh] max-w-[96vw]" />
          <button type="button" className={`${BTN} absolute right-4 top-4`} onClick={() => onEnlarge(null)}>
            Fermer (Échap)
          </button>
        </div>
      )}
    </section>
  );
}
