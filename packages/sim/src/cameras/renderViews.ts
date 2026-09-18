import { CAMERA_IDS, VIEW_SIZE_PX, type CameraId, type Tomato, type ViewImage, type ViewsResult } from '@tomato/shared';
import type { SimContext } from '../core/module';
import type { SceneHandle } from '../three/createScene';
import { poseCamera, renderToImageData, setGizmoVisible, type AgentCameras } from './agentCameras';
import { buildOverlay } from './annotations';
import { drawCommands } from './drawOverlay';
import { compose, darken, sobelEdges, type EdgeFilter } from './edges';
import { chooseSpacing } from './gridSpacing';
import { renderIdPass } from './idPass';
import { pxPerCmOf } from './ortho';
import { toViewsPayload } from './payload';
import { visibilityFraction } from './visibility';

/** Le rendu est assombri à 35 % avant les contours (spec 4.5, couche 1). */
export const DARKEN_FACTOR = 0.35;
const DATA_URL_PREFIX = 'data:image/png;base64,';

export type RenderViews = (cameras: CameraId[]) => Promise<ViewsResult>;

let currentEdgeFilter: EdgeFilter = sobelEdges;

/** Remplace le filtre de contours du pipeline (M4 : Canny + CLAHE une fois OpenCV.js chargé). */
export function setEdgeFilter(filter: EdgeFilter): void {
  currentEdgeFilter = filter;
}

export function getEdgeFilter(): EdgeFilter {
  return currentEdgeFilter;
}

type Measured = Map<number, Partial<Record<CameraId, number>>>;

function withVisibility(t: Tomato, m: Partial<Record<CameraId, number>> | undefined): Tomato {
  return m ? { ...t, visibleIn: { ...t.visibleIn, ...m } } : t;
}

/**
 * Pipeline des vues : passe d'identifiants → visibleIn dans le store → payload JSON → pour chaque caméra,
 * rendu → assombrissement → contours → annotations → PNG base64. Tout est synchrone (une seule frame).
 */
export function createViewRenderer(ctx: SimContext, scene: SceneHandle, cams: AgentCameras): RenderViews {
  const canvas = document.createElement('canvas');
  canvas.width = VIEW_SIZE_PX;
  canvas.height = VIEW_SIZE_PX;
  const ctx2d = canvas.getContext('2d');
  if (!ctx2d) throw new Error('2D canvas context unavailable'); // à l'init, jamais vers l'agent

  return (cameras) => {
    const requested = CAMERA_IDS.filter((id) => cameras.includes(id));
    const { renderer, scene: threeScene } = scene;
    for (const id of CAMERA_IDS) setGizmoVisible(cams[id], false);
    try {
      const before = ctx.store.get();
      const measured: Measured = new Map();
      for (const id of requested) {
        const pose = before.cameras[id];
        poseCamera(cams[id], pose);
        const counts = renderIdPass(renderer, threeScene, cams[id]);
        const k = pxPerCmOf(pose);
        for (const t of before.tomatoes) {
          const m = measured.get(t.id) ?? {};
          m[id] = visibilityFraction(counts.get(t.id) ?? 0, t.radiusCm, k);
          measured.set(t.id, m);
        }
      }
      if (requested.length > 0) {
        ctx.store.update((s) => ({ ...s, tomatoes: s.tomatoes.map((t) => withVisibility(t, measured.get(t.id))) }));
      }
      const payload = toViewsPayload(ctx.store.get());
      const images: ViewImage[] = requested.map((id) => {
        const pose = payload.cameras[id];
        const base = renderToImageData(renderer, threeScene, cams[id]);
        ctx2d.putImageData(compose(darken(base, DARKEN_FACTOR), getEdgeFilter()(base)), 0, 0);
        drawCommands(ctx2d, buildOverlay(id, pose, payload, chooseSpacing(pxPerCmOf(pose))));
        const url = canvas.toDataURL('image/png');
        const pngBase64 = url.startsWith(DATA_URL_PREFIX) ? url.slice(DATA_URL_PREFIX.length) : url;
        return { camera: id, pngBase64, widthPx: VIEW_SIZE_PX, heightPx: VIEW_SIZE_PX };
      });
      return Promise.resolve({ images, json: payload });
    } finally {
      for (const id of CAMERA_IDS) setGizmoVisible(cams[id], true);
    }
  };
}
