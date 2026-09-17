import { composeRgba, darkenRgba, grayscale, sobelMagnitude, thresholdToWhite } from './edgesCore';

/** Filtre de contours : ImageData → ImageData blanc sur transparent. M4 fournira Canny + CLAHE (OpenCV.js). */
export type EdgeFilter = (img: ImageData) => ImageData;

/** Seuil sur l'amplitude de Sobel (0..~1442 pour des niveaux 0..255) ; les bords feuille/fond dépassent largement. */
export const SOBEL_THRESHOLD = 120;

export const sobelEdges: EdgeFilter = (img) => {
  const gray = grayscale(img.data, img.width * img.height);
  const magnitude = sobelMagnitude(gray, img.width, img.height);
  return new ImageData(thresholdToWhite(magnitude, SOBEL_THRESHOLD), img.width, img.height);
};

export function darken(img: ImageData, factor: number): ImageData {
  return new ImageData(darkenRgba(img.data, factor), img.width, img.height);
}

export function compose(base: ImageData, over: ImageData): ImageData {
  return new ImageData(composeRgba(base.data, over.data), base.width, base.height);
}
