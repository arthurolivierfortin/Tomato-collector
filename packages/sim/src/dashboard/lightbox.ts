import type { CameraId } from '@tomato/shared';

/** Zoom de la loupe plein écran (issue #22) : ×1 = image entière, ×4 au maximum. */
export const ZOOM_MIN = 1;
export const ZOOM_MAX = 4;

export interface LightboxView {
  camera: CameraId;
  zoom: number;
  /** Déplacement de l'image en pixels écran, appliqué après le zoom. */
  panXPx: number;
  panYPx: number;
}

export const closedLightbox = (camera: CameraId): LightboxView => ({ camera, zoom: ZOOM_MIN, panXPx: 0, panYPx: 0 });

export function clampZoom(zoom: number): number {
  if (!Number.isFinite(zoom)) return ZOOM_MIN;
  return Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, zoom));
}

/**
 * Ce que le store retient d'une vue : zoom borné, et aucun déplacement possible à ×1 (l'image entière
 * tient dans le cadre). Le recadrage fin dépend de la taille du cadre : il est fait par `clampView`.
 */
export function normalizeView(view: LightboxView): LightboxView {
  const zoom = clampZoom(view.zoom);
  if (zoom === ZOOM_MIN) return { camera: view.camera, zoom, panXPx: 0, panYPx: 0 };
  const finite = (v: number): number => (Number.isFinite(v) ? v : 0);
  return { camera: view.camera, zoom, panXPx: finite(view.panXPx), panYPx: finite(view.panYPx) };
}

/**
 * Borne le zoom et empêche l'image de sortir du cadre : à ×1 le déplacement est nul, à ×z il ne peut
 * dépasser la moitié du débord ((z − 1) × taille / 2) dans chaque direction.
 */
export function clampView(view: LightboxView, sizePx: number): LightboxView {
  const zoom = clampZoom(view.zoom);
  const max = (Math.max(0, zoom - 1) * sizePx) / 2;
  const clamp = (v: number): number => (Number.isFinite(v) ? Math.min(max, Math.max(-max, v)) : 0);
  return { camera: view.camera, zoom, panXPx: clamp(view.panXPx), panYPx: clamp(view.panYPx) };
}

/**
 * Zoom à la molette centré sur le curseur : le point sous le curseur reste sous le curseur.
 * `cursor` est relatif au centre du cadre, en pixels écran.
 */
export function zoomAtCursor(view: LightboxView, factor: number, cursorXPx: number, cursorYPx: number, sizePx: number): LightboxView {
  const zoom = clampZoom(view.zoom * factor);
  const k = zoom / view.zoom;
  return clampView({ camera: view.camera, zoom, panXPx: cursorXPx - (cursorXPx - view.panXPx) * k, panYPx: cursorYPx - (cursorYPx - view.panYPx) * k }, sizePx);
}
