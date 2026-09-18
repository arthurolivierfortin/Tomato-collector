import { memo, useEffect, useRef } from 'react';
import type { PerceptionState } from '../perception/types';
import { activeDetectorName, boxStyle, detectionLabel, edgesLabel, gateLabel, inferenceLabel, modelStatusLabel } from './perceptionView';

interface Props {
  state: PerceptionState;
  open: boolean;
  onToggle: () => void;
  /** Ouvre le mode « Pipeline de traitement » plein écran sur la vue front (touche `x`). */
  onOpenPipeline: () => void;
}

function Line({ label, value, testId }: { label: string; value: string; testId?: string }) {
  return (
    <div className="flex items-baseline gap-2">
      <span className="shrink-0 text-ink-dim">{label}</span>
      <span className="min-w-0 truncate font-mono text-ink" {...(testId === undefined ? {} : { 'data-testid': testId })}>
        {value}
      </span>
    </div>
  );
}

/**
 * Panneau « Perception » (issue #36, touche `p`) : l'image telle que le détecteur la reçoit — la frame
 * RGBA d'entrée, pas la vue annotée — avec ses boîtes, la classe et la confiance de chacune, le nom du
 * détecteur réellement actif, le temps de la dernière inférence et l'avancement de la porte de réveil.
 * Le spectateur voit ainsi ce sur quoi la décision « mûre » est prise, et rien d'autre.
 */
export const PerceptionPanel = memo(function PerceptionPanel({ state, open, onToggle, onOpenPipeline }: Props) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const image = state.lastImage;
  // `open` est une dépendance : le canevas n'existe pas tant que le panneau est replié, et il faut
  // peindre la frame courante à l'ouverture sans attendre le tick suivant (0,5 s de temps sim).
  useEffect(() => {
    const el = canvas.current;
    if (el === null || image === null) return;
    el.width = image.width;
    el.height = image.height;
    const c = el.getContext('2d');
    // jsdom ne fournit pas de contexte 2D : le panneau reste lisible sans l'image.
    if (c === null) return;
    c.putImageData(image instanceof ImageData ? image : new ImageData(new Uint8ClampedArray(image.data), image.width, image.height), 0, 0);
  }, [image, open]);

  return (
    <section aria-label="Perception" className="flex shrink-0 flex-col border-t border-line bg-black/40">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        aria-controls="perception-body"
        className="flex h-7 shrink-0 items-center gap-2 px-3 text-[12px] text-ink-dim hover:text-ink"
      >
        <span aria-hidden="true">{open ? '▾' : '▸'}</span>
        Perception (p)
        <span className="ml-auto font-mono text-[11px] text-ink" data-testid="perception-detector">
          {activeDetectorName(state)}
        </span>
      </button>
      {open && (
        <div id="perception-body" data-testid="perception-panel" className="flex min-h-0 flex-col gap-1.5 px-3 pb-3 text-[11.5px]">
          {/* Le cadre reste carré et borné : le panneau ne doit pas écraser la trace au-dessus de lui. */}
          <div className="relative mx-auto aspect-square w-full max-w-[13rem] overflow-hidden rounded-sm border border-line bg-black">
            <canvas ref={canvas} data-testid="perception-frame" className="block aspect-square w-full" />
            {image === null && <p className="absolute inset-0 grid place-items-center text-ink-dim">En attente de la première frame du détecteur.</p>}
            {state.lastDetections.map((d, i) => (
              <div
                key={`${d.label}-${i}`}
                data-testid="perception-box"
                className={`pointer-events-none absolute border-2 ${d.label === 'ripe' ? 'border-ripe' : 'border-unripe'}`}
                style={boxStyle(d, image?.width ?? 1, image?.height ?? 1)}
              >
                <span className={`absolute -top-[1.1rem] left-0 whitespace-nowrap bg-black/75 px-1 font-mono text-[10.5px] ${d.label === 'ripe' ? 'text-ripe' : 'text-unripe'}`}>
                  {detectionLabel(d)}
                </span>
              </div>
            ))}
          </div>
          <Line label="détecteur" value={`${activeDetectorName(state)} · ${modelStatusLabel(state)}`} />
          <Line label="inférence" value={inferenceLabel(state)} testId="perception-inference" />
          <Line label="porte" value={gateLabel(state)} testId="perception-gate" />
          <Line label="contours" value={edgesLabel(state)} />
          <p className="text-ink-dim">
            Image d’entrée du détecteur, sans annotation. La décision « mûre » ne vient que d’ici ; les identifiants sont attribués ensuite par projection.
          </p>
          <button type="button" onClick={onOpenPipeline} className="self-start rounded-sm border border-line px-2 py-1 text-[11.5px] text-ink-dim hover:border-axes hover:text-ink">
            Voir tout le pipeline (x)
          </button>
        </div>
      )}
    </section>
  );
});
