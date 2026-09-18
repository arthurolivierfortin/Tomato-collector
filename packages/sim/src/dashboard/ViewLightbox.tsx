import { useCallback, useEffect, useRef } from 'react';
import { CAMERA_IDS, type CameraId, type ViewImage } from '@tomato/shared';
import { ZOOM_MIN, clampView, zoomAtCursor, type LightboxView } from './lightbox';

/** Un cran de molette multiplie ou divise le zoom par ce facteur. */
const WHEEL_STEP = 1.2;

interface Props {
  view: LightboxView;
  views: Record<CameraId, ViewImage | null>;
  onClose: () => void;
  onCamera: (camera: CameraId) => void;
  onView: (view: LightboxView) => void;
}

/**
 * Loupe plein écran (touche `z` ou clic sur la grande vue) : l'image 800×800 à la plus grande taille
 * possible, zoom à la molette centré sur le curseur (×1 à ×4), déplacement au glisser, changement de
 * caméra sans fermer, fermeture par Échap ou clic sur le fond.
 */
export function ViewLightbox({ view, views, onClose, onCamera, onView }: Props) {
  const stage = useRef<HTMLDivElement | null>(null);
  const drag = useRef<{ x: number; y: number; panXPx: number; panYPx: number } | null>(null);
  const image = views[view.camera];

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const sizeOf = useCallback((): number => {
    const box = stage.current?.getBoundingClientRect();
    return box ? Math.min(box.width, box.height) : 0;
  }, []);

  const onWheel = useCallback(
    (e: React.WheelEvent<HTMLDivElement>) => {
      const box = stage.current?.getBoundingClientRect();
      if (!box) return;
      const factor = e.deltaY < 0 ? WHEEL_STEP : 1 / WHEEL_STEP;
      onView(zoomAtCursor(view, factor, e.clientX - (box.left + box.width / 2), e.clientY - (box.top + box.height / 2), Math.min(box.width, box.height)));
    },
    [onView, view],
  );

  const onPointerDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (view.zoom <= ZOOM_MIN) return;
      drag.current = { x: e.clientX, y: e.clientY, panXPx: view.panXPx, panYPx: view.panYPx };
    },
    [view],
  );

  const onPointerMove = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      const from = drag.current;
      if (!from) return;
      onView(clampView({ camera: view.camera, zoom: view.zoom, panXPx: from.panXPx + (e.clientX - from.x), panYPx: from.panYPx + (e.clientY - from.y) }, sizeOf()));
    },
    [onView, sizeOf, view.camera, view.zoom],
  );

  const endDrag = useCallback(() => {
    drag.current = null;
  }, []);

  return (
    <div
      data-testid="lightbox"
      role="dialog"
      aria-modal="true"
      aria-label={`Vue ${view.camera} en plein écran`}
      onClick={onClose}
      className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-3 bg-black/92 p-4"
    >
      <div
        data-testid="lightbox-stage"
        ref={stage}
        onClick={(e) => e.stopPropagation()}
        onWheel={onWheel}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerLeave={endDrag}
        className={`relative flex min-h-0 w-full flex-1 items-center justify-center overflow-hidden ${view.zoom > ZOOM_MIN ? 'cursor-grab' : 'cursor-zoom-in'}`}
      >
        {image ? (
          <img
            alt={`vue ${view.camera} en plein écran`}
            src={`data:image/png;base64,${image.pngBase64}`}
            draggable={false}
            style={{ transform: `translate(${view.panXPx}px, ${view.panYPx}px) scale(${view.zoom})` }}
            className="max-h-full max-w-full select-none object-contain"
          />
        ) : (
          <p className="text-[13px] text-ink-dim">Aucune image reçue pour la vue {view.camera}.</p>
        )}
      </div>
      <div className="flex shrink-0 items-center gap-2" onClick={(e) => e.stopPropagation()}>
        {CAMERA_IDS.map((id) => (
          <button
            key={id}
            type="button"
            aria-pressed={id === view.camera}
            aria-label={`Vue ${id}`}
            onClick={() => onCamera(id)}
            className="rounded-sm border border-line bg-panel px-2.5 py-1 text-[12px] text-ink-dim hover:border-axes hover:text-ink focus-visible:outline focus-visible:outline-stem aria-pressed:border-stem aria-pressed:text-stem"
          >
            {id}
          </button>
        ))}
        <span className="ml-2 font-mono text-[11px] tabular-nums text-ink-dim">×{view.zoom.toFixed(1)}</span>
        <span className="ml-2 text-[11px] text-ink-dim">molette : zoom · glisser : déplacer · Échap : fermer</span>
      </div>
    </div>
  );
}
