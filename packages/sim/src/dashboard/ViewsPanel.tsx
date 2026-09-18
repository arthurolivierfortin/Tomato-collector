import { CAMERA_IDS, type CameraId, type ViewImage } from '@tomato/shared';
import { formatAge } from './traceFormat';
import { BTN } from './ui';
import { useFlash } from './useFlash';
import { useNow } from './useNow';

/** Durée du flash du cadre à chaque message `views`. */
export const VIEWS_FLASH_MS = 400;

const CAMERA_AXES: Record<CameraId, string> = { top: 'X → droite, Y → haut', front: 'X → droite, Z → haut', side: 'Y → droite, Z → haut' };

const src = (img: ViewImage): string => `data:image/png;base64,${img.pngBase64}`;

interface TileProps {
  camera: CameraId;
  image: ViewImage | null;
  age: string;
  big: boolean;
  onClick: () => void;
}

/**
 * Une vue : l'image telle que reçue par l'agent, son nom, ses axes et l'âge de l'image.
 * Sans image (tout premier chargement de cette caméra seulement), la tuile dit « en attente ».
 */
function Tile({ camera, image, age, big, onClick }: TileProps) {
  return (
    <figure
      data-testid={big ? 'view-featured' : `view-thumb-${camera}`}
      data-camera={camera}
      className={`flex min-h-0 min-w-0 flex-col gap-1 ${big ? 'flex-1' : 'h-full'}`}
    >
      <button
        type="button"
        aria-label={big ? `Ouvrir la vue ${camera} en plein écran` : `Mettre la vue ${camera} en avant`}
        onClick={onClick}
        className={`relative flex min-h-0 flex-1 items-center justify-center overflow-hidden rounded-sm border border-line bg-black focus-visible:outline focus-visible:outline-stem ${big ? '' : 'aspect-square self-center hover:border-stem'}`}
      >
        {image ? (
          <img alt={`vue ${camera}`} src={src(image)} className="h-full w-full object-contain" />
        ) : (
          <span className="p-2 text-[12px] text-ink-dim">en attente…</span>
        )}
      </button>
      <figcaption className="flex shrink-0 items-baseline justify-between gap-2 text-[11px] text-ink-dim">
        <span>
          <span className={big ? 'text-[13px] text-ink' : 'text-ink'}>{camera}</span> {CAMERA_AXES[camera]}
        </span>
        <span className="shrink-0 font-mono tabular-nums">{age}</span>
      </figcaption>
    </figure>
  );
}

interface Props {
  views: Record<CameraId, ViewImage | null>;
  viewsAt: Record<CameraId, number | null>;
  featured: CameraId;
  lastViewsAt: number | null;
  /** Mode « ce que voit l'agent » (touche v) : les trois vues en grand, côte à côte. */
  agentView: boolean;
  onFeature: (camera: CameraId) => void;
  onOpen: (camera: CameraId) => void;
  /** Rendu local des trois vues ; fourni seulement hors connexion serveur (sinon c'est l'agent qui les demande). */
  onRefresh?: () => void;
  /** Horloge figée (tests, captures). */
  nowMs?: number;
}

/**
 * « Ce que voit l'agent » : la vue demandée en dernier par l'agent en grand, les deux autres en vignettes
 * dessous (clic pour permuter), l'âge de chaque image, et un flash à chaque nouveau message `views`.
 */
export function ViewsPanel({ views, viewsAt, featured, lastViewsAt, agentView, onFeature, onOpen, onRefresh, nowMs }: Props) {
  const flash = useFlash(lastViewsAt, VIEWS_FLASH_MS);
  const now = useNow(nowMs);
  const others = CAMERA_IDS.filter((id) => id !== featured);

  return (
    <section
      data-testid="views"
      data-flash={flash ? 'true' : undefined}
      aria-label="Ce que voit l'agent"
      className={`flex h-full min-h-0 min-w-0 flex-col gap-2 overflow-hidden border-l border-line p-3 ${flash ? 'views-flash' : ''}`}
    >
      {onRefresh && (
        <div className="flex shrink-0 items-center justify-between gap-2">
          <h2 className="text-[11px] uppercase tracking-widest text-ink-dim">Vues de l&apos;agent</h2>
          <button type="button" data-testid="refresh-views" onClick={onRefresh} className={BTN}>
            Rafraîchir les vues
          </button>
        </div>
      )}
      {agentView ? (
        <div className="grid min-h-0 flex-1 grid-cols-3 gap-3">
          {CAMERA_IDS.map((id) => (
            <Tile key={id} camera={id} image={views[id]} age={formatAge(viewsAt[id], now)} big onClick={() => onOpen(id)} />
          ))}
        </div>
      ) : (
        <>
          <Tile camera={featured} image={views[featured]} age={formatAge(viewsAt[featured], now)} big onClick={() => onOpen(featured)} />
          {/* Les deux autres vues en vignettes carrées : hauteur fixe pour laisser ≥ 600 px à la vue en avant. */}
          <div className="flex h-[13rem] shrink-0 justify-center gap-4">
            {others.map((id) => (
              <Tile key={id} camera={id} image={views[id]} age={formatAge(viewsAt[id], now)} big={false} onClick={() => onFeature(id)} />
            ))}
          </div>
        </>
      )}
    </section>
  );
}
