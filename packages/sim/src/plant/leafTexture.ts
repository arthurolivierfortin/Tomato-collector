import { CanvasTexture, SRGBColorSpace } from 'three';

let cached: CanvasTexture | null = null;

/** Feuille dessinée sur un canvas : forme lobée verte avec nervure, fond transparent. */
export function getLeafTexture(): CanvasTexture {
  if (cached) return cached;
  const size = 256;
  const c = document.createElement('canvas');
  c.width = size;
  c.height = size;
  const ctx = c.getContext('2d')!;
  ctx.clearRect(0, 0, size, size);
  ctx.fillStyle = '#3f8f3a';
  ctx.beginPath();
  ctx.moveTo(size / 2, 8);
  ctx.bezierCurveTo(size * 0.95, size * 0.2, size * 0.9, size * 0.75, size / 2, size - 8);
  ctx.bezierCurveTo(size * 0.1, size * 0.75, size * 0.05, size * 0.2, size / 2, 8);
  ctx.fill();
  ctx.strokeStyle = '#2b6b28';
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.moveTo(size / 2, 12);
  ctx.lineTo(size / 2, size - 12);
  ctx.stroke();
  cached = new CanvasTexture(c);
  cached.colorSpace = SRGBColorSpace;
  return cached;
}
