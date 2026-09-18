import type { EdgeFilter } from '../cameras/edges';
import type { RgbaImage } from './types';

/** Seuils de Canny (spec 4.4 : 50/150), ouverture de Sobel 3, norme L1. */
export const CANNY_LOW = 50;
export const CANNY_HIGH = 150;
/** CLAHE : limite de contraste et grille de tuiles 8×8 (défauts usuels d'OpenCV). */
export const CLAHE_CLIP_LIMIT = 2;
export const CLAHE_TILES = 8;

/**
 * Sous-ensemble d'OpenCV.js utilisé par le filtre, en types structurels : le vrai module `cv` s'y conforme
 * (vérifié sur @techstark/opencv-js 4.11.0-release.1) et les tests Node passent un faux.
 * Note : `cv.createCLAHE` est déclaré dans les types mais absent à l'exécution ; c'est la classe `cv.CLAHE` qui existe.
 */
export interface CvMat {
  readonly data: Uint8Array;
  readonly rows: number;
  readonly cols: number;
  delete(): void;
}

export interface CvSize {
  width: number;
  height: number;
}

export interface CvClahe {
  apply(src: CvMat, dst: CvMat): void;
  delete(): void;
}

export interface CvApi {
  Mat: new () => CvMat;
  Size: new (width: number, height: number) => CvSize;
  CLAHE: new (clipLimit: number, tileGridSize: CvSize) => CvClahe;
  COLOR_RGBA2GRAY: number;
  matFromImageData(img: RgbaImage): CvMat;
  cvtColor(src: CvMat, dst: CvMat, code: number): void;
  Canny(image: CvMat, edges: CvMat, threshold1: number, threshold2: number, apertureSize: number, l2gradient: boolean): void;
}

/** Carte de contours CV_8UC1 (0 ou 255) → RGBA blanc opaque sur les contours, transparent ailleurs (contrat EdgeFilter). */
export function edgesToWhiteRgba(edges: Uint8Array, pixelCount: number): Uint8ClampedArray<ArrayBuffer> {
  const out = new Uint8ClampedArray(pixelCount * 4);
  for (let i = 0; i < pixelCount; i++) {
    if ((edges[i] ?? 0) > 0) out.set([255, 255, 255, 255], i * 4);
  }
  return out;
}

/** Plan de gris CV_8UC1 → RGBA opaque, pour afficher un tampon intermédiaire tel quel (issue #36). */
export function grayToRgba(gray: Uint8Array, pixelCount: number): Uint8ClampedArray<ArrayBuffer> {
  const out = new Uint8ClampedArray(pixelCount * 4);
  for (let i = 0; i < pixelCount; i++) {
    const v = gray[i] ?? 0;
    out.set([v, v, v, 255], i * 4);
  }
  return out;
}

/** Niveaux de gris → CLAHE → Canny 50/150 ; libère chaque Mat même en cas d'erreur. */
export function cannyClaheRgba(cv: CvApi, img: RgbaImage): Uint8ClampedArray<ArrayBuffer> {
  const src = cv.matFromImageData(img);
  const gray = new cv.Mat();
  const equalized = new cv.Mat();
  const edges = new cv.Mat();
  const clahe = new cv.CLAHE(CLAHE_CLIP_LIMIT, new cv.Size(CLAHE_TILES, CLAHE_TILES));
  try {
    cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY);
    clahe.apply(gray, equalized);
    cv.Canny(equalized, edges, CANNY_LOW, CANNY_HIGH, 3, false);
    return edgesToWhiteRgba(edges.data, img.width * img.height);
  } finally {
    clahe.delete();
    edges.delete();
    equalized.delete();
    gray.delete();
    src.delete();
  }
}

/** Le même pipeline arrêté après CLAHE : le gris égalisé qui entre dans Canny (mode pipeline, issue #36). */
export function claheGrayRgba(cv: CvApi, img: RgbaImage): Uint8ClampedArray<ArrayBuffer> {
  const src = cv.matFromImageData(img);
  const gray = new cv.Mat();
  const equalized = new cv.Mat();
  const clahe = new cv.CLAHE(CLAHE_CLIP_LIMIT, new cv.Size(CLAHE_TILES, CLAHE_TILES));
  try {
    cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY);
    clahe.apply(gray, equalized);
    return grayToRgba(equalized.data, img.width * img.height);
  } finally {
    clahe.delete();
    equalized.delete();
    gray.delete();
    src.delete();
  }
}

/** Filtre de contours branché dans le pipeline des vues (M3) à la place de Sobel. Navigateur seulement (`ImageData`). */
export function createCannyClaheFilter(cv: CvApi): EdgeFilter {
  return (img) => new ImageData(cannyClaheRgba(cv, img), img.width, img.height);
}

/** Charge OpenCV.js une fois (≈ 11 Mo, import dynamique pour ne pas retarder la page) ; null si indisponible. */
export async function loadOpenCv(): Promise<CvApi | null> {
  try {
    const mod = await import('@techstark/opencv-js');
    const cv: CvApi = await mod.default;
    return cv;
  } catch (error) {
    console.warn('[perception] OpenCV.js indisponible, contours Sobel conservés', error);
    return null;
  }
}
