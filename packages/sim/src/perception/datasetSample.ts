import { VIEW_SIZE_PX, type CameraId, type CameraPose, type Tomato } from '@tomato/shared';
import { renderCameraImage } from '../cameras/cameraModule';
import { projectToPixel, pxPerCmOf } from '../cameras/ortho';
import type { SimContext } from '../core/module';
import type { DetectionLabel } from './types';

/** Fraction visible minimale pour étiqueter un fruit : en dessous, il est trop occulté pour être appris. */
export const MIN_LABEL_VISIBILITY = 0.25;
/** Côté minimal d'une boîte, en pixels : un fruit de 3 px n'apprend rien et pollue le rappel. */
export const MIN_LABEL_SIDE_PX = 8;

export interface SampleLabel {
  tomatoId: number;
  label: DetectionLabel;
  /** [x, y, w, h] en pixels de l'image, déjà recadré au cadre. */
  bbox: [number, number, number, number];
}

export interface DatasetSample {
  camera: CameraId;
  widthPx: number;
  heightPx: number;
  pngBase64: string;
  labels: SampleLabel[];
}

const clamp = (v: number, max: number): number => Math.max(0, Math.min(max, v));

/**
 * Étiquettes de vérité terrain d'une vue, calculées par projection : un fruit sphérique se projette en
 * orthographique sur un carré de 2 r. Seuls les fruits attachés, assez visibles et assez grands sont
 * gardés. `turning` compte comme `unripe` : les deux classes du modèle Hugging Face sont ripe/unripe.
 */
export function labelsFor(camId: CameraId, pose: CameraPose, tomatoes: readonly Tomato[], sizePx: number = VIEW_SIZE_PX): SampleLabel[] {
  const k = (sizePx / VIEW_SIZE_PX) * pxPerCmOf(pose);
  const out: SampleLabel[] = [];
  for (const t of tomatoes) {
    if (!t.attached || (t.visibleIn[camId] ?? 0) < MIN_LABEL_VISIBILITY) continue;
    const [cx, cy] = projectToPixel(camId, pose, t.positionCm);
    const r = t.radiusCm * k;
    const scale = sizePx / VIEW_SIZE_PX;
    const x0 = clamp(cx * scale - r, sizePx);
    const y0 = clamp(cy * scale - r, sizePx);
    const x1 = clamp(cx * scale + r, sizePx);
    const y1 = clamp(cy * scale + r, sizePx);
    if (x1 - x0 < MIN_LABEL_SIDE_PX || y1 - y0 < MIN_LABEL_SIDE_PX) continue;
    out.push({ tomatoId: t.id, label: t.state === 'ripe' ? 'ripe' : 'unripe', bbox: [x0, y0, x1 - x0, y1 - y0] });
  }
  return out;
}

const DATA_URL_PREFIX = 'data:image/png;base64,';

/**
 * Un échantillon du jeu d'évaluation (issue #36) : l'image caméra BRUTE, sans contours ni annotations —
 * la même que celle donnée au détecteur — et ses boîtes de vérité terrain. Appeler `renderViews` avant,
 * pour que `visibleIn` soit à jour. Null sans scène.
 */
export function captureSample(camera: CameraId, ctx: SimContext): DatasetSample | null {
  if (!ctx.scene) return null;
  const img = renderCameraImage(ctx.scene, camera);
  if (img === null) return null;
  const canvas = document.createElement('canvas');
  canvas.width = img.width;
  canvas.height = img.height;
  const c = canvas.getContext('2d');
  if (c === null) return null;
  c.putImageData(img, 0, 0);
  const url = canvas.toDataURL('image/png');
  const world = ctx.store.get();
  return {
    camera,
    widthPx: img.width,
    heightPx: img.height,
    pngBase64: url.startsWith(DATA_URL_PREFIX) ? url.slice(DATA_URL_PREFIX.length) : url,
    labels: labelsFor(camera, world.cameras[camera], world.tomatoes, img.width),
  };
}
