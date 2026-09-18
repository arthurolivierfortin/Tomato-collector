import { resizeRgba } from './rgba';
import type { Detection, DetectionLabel, RgbaImage } from './types';

/** Côté de l'entrée du modèle (export Ultralytics `imgsz=640`) : tenseur `images` [1, 3, 640, 640]. */
export const YOLO_INPUT_PX = 640;
/** Seuil de score pour garder une boîte au décodage (avant NMS). */
export const YOLO_DECODE_SCORE_MIN = 0.25;
/** IoU au-delà duquel une boîte de même classe est supprimée par la NMS. */
export const YOLO_IOU_THRESHOLD = 0.45;
/** Gris de remplissage du letterbox (convention Ultralytics : 114). */
const LETTERBOX_FILL = 114;

export interface Letterboxed {
  /** CHW, RGB, valeurs 0..1, taille 3 × size × size. */
  tensor: Float32Array;
  size: number;
  scale: number;
  padX: number;
  padY: number;
}

export interface ModelMeta {
  names: string[];
}

/** Redimensionne l'image dans un carré `size` en gardant les proportions, centrée sur fond gris, en CHW normalisé. */
export function letterbox(img: RgbaImage, size: number): Letterboxed {
  const scale = size / Math.max(img.width, img.height);
  const w = Math.max(1, Math.round(img.width * scale));
  const h = Math.max(1, Math.round(img.height * scale));
  const padX = Math.floor((size - w) / 2);
  const padY = Math.floor((size - h) / 2);
  const resized = resizeRgba(img, w, h);
  const plane = size * size;
  const tensor = new Float32Array(3 * plane).fill(LETTERBOX_FILL / 255);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const src = (y * w + x) * 4;
      const dst = (y + padY) * size + (x + padX);
      tensor[dst] = (resized.data[src] ?? 0) / 255;
      tensor[plane + dst] = (resized.data[src + 1] ?? 0) / 255;
      tensor[2 * plane + dst] = (resized.data[src + 2] ?? 0) / 255;
    }
  }
  return { tensor, size, scale, padX, padY };
}

/** Ramène une boîte exprimée en pixels du letterbox vers les pixels de l'image d'origine. */
export function unletterbox(det: Detection, lb: Letterboxed): Detection {
  const [x, y, w, h] = det.bbox;
  return { ...det, bbox: [(x - lb.padX) / lb.scale, (y - lb.padY) / lb.scale, w / lb.scale, h / lb.scale] };
}

/** `unripe` prime sur `ripe` (« unripe » contient « ripe ») ; tout autre nom est traité comme immature. */
export function labelFromName(name: string): DetectionLabel {
  const n = name.toLowerCase();
  if (n.includes('unripe')) return 'unripe';
  return n.includes('ripe') ? 'ripe' : 'unripe';
}

/** Valide le fichier `tomato-ripe.json` écrit par `scripts/export-yolo.py`. */
export function parseModelMeta(value: unknown): ModelMeta | null {
  if (typeof value !== 'object' || value === null) return null;
  const names = (value as { names?: unknown }).names;
  if (!Array.isArray(names) || names.length === 0 || !names.every((n) => typeof n === 'string')) return null;
  return { names: names as string[] };
}

/**
 * Décode la sortie brute `output0` d'un export YOLOv8 de détection : dims [1, 4 + nc, N], lignes cx, cy, w, h
 * (pixels du letterbox) puis un score sigmoïde par classe, sans objectness. Garde le meilleur score par ancre.
 */
export function decodeYolo(data: Float32Array, dims: readonly number[], labels: readonly DetectionLabel[], scoreMin: number): Detection[] {
  const rows = dims[1] ?? 0;
  const n = dims[2] ?? 0;
  const nc = rows - 4;
  if (dims.length !== 3 || nc < 1 || nc !== labels.length || data.length < rows * n) return [];
  const out: Detection[] = [];
  for (let i = 0; i < n; i++) {
    let best = -1;
    let bestScore = 0;
    for (let c = 0; c < nc; c++) {
      const s = data[(4 + c) * n + i] ?? 0;
      if (s > bestScore) {
        bestScore = s;
        best = c;
      }
    }
    if (best < 0 || bestScore < scoreMin) continue;
    const cx = data[i] ?? 0;
    const cy = data[n + i] ?? 0;
    const w = data[2 * n + i] ?? 0;
    const h = data[3 * n + i] ?? 0;
    out.push({ bbox: [cx - w / 2, cy - h / 2, w, h], score: bestScore, label: labels[best] ?? 'unripe' });
  }
  return out;
}

export function iou(a: Detection['bbox'], b: Detection['bbox']): number {
  const x1 = Math.max(a[0], b[0]);
  const y1 = Math.max(a[1], b[1]);
  const x2 = Math.min(a[0] + a[2], b[0] + b[2]);
  const y2 = Math.min(a[1] + a[3], b[1] + b[3]);
  const inter = Math.max(0, x2 - x1) * Math.max(0, y2 - y1);
  const union = a[2] * a[3] + b[2] * b[3] - inter;
  return union <= 0 ? 0 : inter / union;
}

/** Suppression des non-maxima gloutonne, par classe ; résultat trié par score décroissant. */
export function nms(dets: readonly Detection[], iouThreshold: number): Detection[] {
  const sorted = [...dets].sort((a, b) => b.score - a.score);
  const kept: Detection[] = [];
  for (const d of sorted) {
    if (kept.every((k) => k.label !== d.label || iou(k.bbox, d.bbox) <= iouThreshold)) kept.push(d);
  }
  return kept;
}
