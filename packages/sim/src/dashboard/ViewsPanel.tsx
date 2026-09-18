import { CAMERA_IDS, type CameraId, type ViewImage } from '@tomato/shared';
import { formatAge } from './traceFormat';
import { BTN } from './ui';
import { useFlash } from './useFlash';
import { AGE_TICK_MS, useNow } from './useNow';

/** Durée du flash du cadre à chaque message `views`. */
export const VIEWS_FLASH_MS = 400;

const CAMERA_AXES: Record<CameraId, string> = { top: 'X → droite, Y → haut', front: 'X → droite, Z → haut', side: 'Y → droite, Z → haut' };

const src = (img: ViewImage): string => `data:image/png;base64,${img.pngBase64}`;

interface TileProps {
  camera: CameraId;
  image: ViewImage | null;
  age: string;
  big: boolean;
  /** Tuile carrée comme l'image : la hauteur commande, aucune bande noire au-dessus ni en dessous. */
  square?: boolean;
  onClick: () => void;
}

/**
 * Une vue : l'image telle que reçue par l'agent, son nom, ses axes et l'âge de l'image.
 * Sans image (tout premier chargement de cette caméra seulement), la tuile dit « en attente ».
 */
function Tile({ camera, image, age, big, square, onClick }: TileProps) {
  const shape = big && square !== true ? '' : 'aspect-square self-center';
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
        className={`relative flex min-h-0 flex-1 items-center justify-center overflow-hidden rounded-sm border border-line bg-black focus-visible:outline focus-visible:outline-stem ${shape} ${big ? '' : 'hover:border-stem'}`}
      >
        {image ? (
          <img alt={`vue ${camera}`} src={src(image)} className="h-full w-full object-contain" />
        ) : (
          // Lisible de loin en tournage : c'est la seule chose à l'écran tant que l'agent n'a rien demandé.
          <span className={`p-2 text-ink ${big ? 'text-[18px]' : 'text-[16px]'}`}>en attente…</span>
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
  const now = useNow(nowMs, AGE_TICK_MS);
  const others = CAMERA_IDS.filter((id) => id !== featured);

  return (
    <section
      data-testid="views"
      data-flash={flash ? 'true' : undefined}
      aria-label="Ce que voit l'agent"
      className={`flex h-full min-h-0 min-w-0 flex-col gap-1 overflow-hidden border-l border-line px-3 pb-1 pt-1 ${flash ? 'views-flash' : ''}`}
    >
      {/* Le titre reste toujours affiché ; seul le rendu local (page seule) ajoute son bouton. */}
      <div className="flex min-h-5 shrink-0 items-center justify-between gap-2">
        <h2 className="text-[11px] uppercase tracking-widest text-ink-dim">Vues de l&apos;agent</h2>
        {onRefresh && (
          <button type="button" data-testid="refresh-views" onClick={onRefresh} className={BTN}>
            Rafraîchir les vues
          </button>
        )}
      </div>
      {agentView ? (
        // Issue #31 : trois carrés côte à côte ne tiennent pas en largeur et laissent 155 px de bandes
        // noires. La vue demandée en dernier prend donc toute la hauteur, les deux autres s'empilent
        // à sa droite : tuiles carrées, aucune bande, et la grande passe de 505 à ~800 px.
        <div className="flex min-h-0 flex-1 items-stretch justify-center gap-3">
          <div className="flex min-h-0 flex-[2] flex-col">
            <Tile camera={featured} image={views[featured]} age={formatAge(viewsAt[featured], now)} big square onClick={() => onOpen(featured)} />
          </div>
          <div className="flex min-h-0 flex-1 flex-col gap-3">
            {others.map((id) => (
              <Tile key={id} camera={id} image={views[id]} age={formatAge(viewsAt[id], now)} big square onClick={() => onOpen(id)} />
            ))}
          </div>
        </div>
      ) : (
        <>
          <Tile camera={featured} image={views[featured]} age={formatAge(viewsAt[featured], now)} big onClick={() => onOpen(featured)} />
          {/* Les deux autres vues en vignettes carrées : hauteur fixe pour laisser ≥ 600 px à la vue en avant. */}
          <div className="flex h-[11.5rem] shrink-0 justify-center gap-4">
            {others.map((id) => (
              <Tile key={id} camera={id} image={views[id]} age={formatAge(viewsAt[id], now)} big={false} onClick={() => onFeature(id)} />
            ))}
          </div>
        </>
      )}
    </section>
  );
}
