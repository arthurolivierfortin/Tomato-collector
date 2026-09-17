import { useCallback, useEffect, useState } from 'react';
import { CAMERA_IDS, type ViewsResult } from '@tomato/shared';
import { subscribeViews } from './cameraModule';

const CAMERA_LABEL = { top: 'top (X → droite, Y → haut)', front: 'front (X → droite, Z → haut)', side: 'side (Y → droite, Z → haut)' } as const;

/** Panneau « ce que voit l'agent » : les trois dernières vues annotées et un bouton de rafraîchissement. */
export function AgentViews() {
  const [views, setViews] = useState<ViewsResult | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => subscribeViews(setViews), []);

  const refresh = useCallback(async () => {
    const render = window.__tomato?.renderViews;
    if (!render) return;
    setBusy(true);
    try {
      await render(['top', 'front', 'side']);
    } finally {
      setBusy(false);
    }
  }, []);

  return (
    <div className="flex h-full flex-col gap-3">
      <div className="flex items-center justify-between">
        <h2 className="text-xs uppercase tracking-widest text-neutral-400">Vues de l'agent</h2>
        <button
          type="button"
          data-testid="refresh-views"
          onClick={() => void refresh()}
          disabled={busy}
          className="rounded border border-neutral-700 px-3 py-1 text-xs text-neutral-200 hover:bg-neutral-800 disabled:opacity-50"
        >
          {busy ? 'Rendu…' : 'Rafraîchir les vues'}
        </button>
      </div>
      <div className="grid grid-cols-3 gap-2">
        {CAMERA_IDS.map((id) => {
          const img = views?.images.find((i) => i.camera === id);
          return (
            <figure key={id} className="flex flex-col gap-1">
              {img ? (
                <img alt={`vue ${id}`} src={`data:image/png;base64,${img.pngBase64}`} className="aspect-square w-full bg-black" />
              ) : (
                <div className="aspect-square w-full bg-neutral-900" />
              )}
              <figcaption className="text-[11px] text-neutral-500">{CAMERA_LABEL[id]}</figcaption>
            </figure>
          );
        })}
      </div>
      {views && (
        <p className="text-[11px] text-neutral-500">
          t = {views.json.simTimeS.toFixed(1)} s · {views.json.tomatoes.length} tomate(s) · cible {views.json.targetTomatoId ?? 'aucune'}
        </p>
      )}
    </div>
  );
}
