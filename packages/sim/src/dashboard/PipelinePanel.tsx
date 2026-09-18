import { useEffect } from 'react';
import { CAMERA_IDS, type CameraId } from '@tomato/shared';
import type { PipelineCapture, PipelineTile } from '../perception/pipelineCapture';
import { CAMERA_LABEL, type StageSource } from '../perception/pipelineModel';
import { BTN } from './ui';

/** Une couleur par provenance : le spectateur repère d'un coup d'œil ce qui vient de l'image. */
const SOURCE_BADGE: Record<StageSource, string> = {
  camera: 'bg-neutral-700 text-neutral-100',
  opencv: 'bg-stem/20 text-stem',
  model: 'bg-fuchsia-900 text-fuchsia-100',
  threshold: 'bg-turning/25 text-turning',
  logic: 'bg-blue-900 text-blue-100',
  calibration: 'bg-neutral-700 text-neutral-200',
  robot: 'bg-basket/20 text-basket',
  sim: 'bg-ripe/25 text-ripe',
  geometry: 'bg-neutral-600 text-neutral-100',
  output: 'bg-unripe/20 text-unripe',
};

function Tile({ tile }: { tile: PipelineTile }) {
  return (
    <figure data-testid="pipeline-tile" data-stage={tile.key} className="flex min-w-0 flex-col gap-1 rounded-sm border border-line bg-panel-2 p-2">
      {/* Titre sur sa ligne, pastille sous lui : à 1920×1080 le couple tenait mal sur une seule ligne. */}
      <figcaption className="flex flex-col gap-1">
        <span className="text-[12.5px] leading-tight text-ink">{tile.title}</span>
        <span className={`w-fit rounded-sm px-1.5 py-0.5 text-[10.5px] ${SOURCE_BADGE[tile.source]}`}>{tile.sourceLabel}</span>
      </figcaption>
      {tile.pngBase64 === '' ? (
        <div className="grid aspect-square w-full place-items-center rounded-sm border border-line bg-black text-[11px] text-ink-dim">tampon indisponible</div>
      ) : (
        <img alt={tile.title} src={`data:image/png;base64,${tile.pngBase64}`} className="aspect-square w-full rounded-sm bg-black object-contain" />
      )}
      <p className="font-mono text-[10.5px] text-ink-dim">{tile.io}</p>
      <p className="text-[11px] leading-snug text-ink-dim">{tile.caption}</p>
    </figure>
  );
}

interface Props {
  camera: CameraId;
  capture: PipelineCapture | null;
  pending: boolean;
  onCamera: (camera: CameraId) => void;
  onRefresh: () => void;
  onClose: () => void;
}

/**
 * Mode « Pipeline de traitement » (issue #36, touche `x`) : plein écran, la chaîne complète du traitement
 * d'une caméra, étape par étape, avec les tampons intermédiaires réels et l'origine honnête de chacun.
 * Échap ferme, les boutons changent de caméra sans fermer.
 */
export function PipelinePanel({ camera, capture, pending, onCamera, onRefresh, onClose }: Props) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div data-testid="pipeline" role="dialog" aria-modal="true" aria-label="Pipeline de traitement" className="fixed inset-0 z-50 flex flex-col gap-3 overflow-y-auto bg-black p-4">
      <header className="flex shrink-0 flex-wrap items-center gap-2">
        <h2 className="text-[15px] text-ink">Pipeline de traitement : caméra {CAMERA_LABEL[camera]}</h2>
        <div role="group" aria-label="Caméra" className="ml-2 flex items-center gap-1">
          {CAMERA_IDS.map((id) => (
            <button key={id} type="button" className={BTN} aria-pressed={id === camera} aria-label={`Caméra ${id}`} onClick={() => onCamera(id)}>
              {id}
            </button>
          ))}
        </div>
        <button type="button" className={BTN} onClick={onRefresh} disabled={pending}>
          Recapturer
        </button>
        <span className="ml-auto text-[11.5px] text-ink-dim">
          {pending ? 'capture en cours…' : 'Échap ou x : fermer'}
        </span>
      </header>
      {capture === null ? (
        <p data-testid="pipeline-empty" className="text-[13px] text-ink-dim">
          {pending ? 'Rendu des étapes en cours…' : 'Aucune scène locale : le pipeline n’est disponible que sur la page qui rend la simulation.'}
        </p>
      ) : (
        // Cinq colonnes : les dix étapes tiennent en deux rangées pleines, pas 7 + 3.
        <div className="grid min-h-0 grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
          {capture.tiles.map((tile) => (
            <Tile key={tile.key} tile={tile} />
          ))}
        </div>
      )}
    </div>
  );
}
