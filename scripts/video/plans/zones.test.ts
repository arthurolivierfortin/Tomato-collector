/**
 * Géométrie de l'écran : l'incrustation de la caméra outil (issue #42) et ce qui doit lui laisser
 * la place. Tout est pur — des rectangles et des intersections, aucun ffmpeg, aucun navigateur.
 */
import { describe, expect, it } from 'vitest';
import { DEFAULT_STYLE, intersects } from '../lib/ffmpegFilters';
import { captionBand, PIP, PROTECTED, SPECTATOR_COLUMN, TOOL_CAM_CAPTION_WIDTH, ZONE } from './zones';

describe('incrustation de la caméra outil', () => {
  it('la pose dans le coin bas droit de la colonne spectateur, 30 % de large et en 4:3', () => {
    // Mesurée sur la page en 1920×1080, contrôles masqués (`getBoundingClientRect` de
    // `[data-testid="tool-camera"]`) : x 548, y 759, 240 × 180.
    expect(ZONE.toolCamera).toEqual({ x: 548, y: 759, w: 240, h: 180 });
    expect(ZONE.toolCamera.w / ZONE.toolCamera.h).toBeCloseTo(4 / 3, 5);
    expect(ZONE.toolCamera.w).toBe(Math.round(SPECTATOR_COLUMN.w * 0.3));
    expect(ZONE.toolCamera.x + ZONE.toolCamera.w).toBeLessThan(SPECTATOR_COLUMN.x + SPECTATOR_COLUMN.w);
    expect(ZONE.toolCamera.y + ZONE.toolCamera.h).toBeLessThan(SPECTATOR_COLUMN.y + SPECTATOR_COLUMN.h);
  });

  it('protège l’étiquette « caméra outil » avec l’image, pas seulement l’image', () => {
    expect(PROTECTED.toolCamera.y).toBeLessThan(ZONE.toolCamera.y);
    expect(PROTECTED.toolCamera.x).toBe(ZONE.toolCamera.x);
    expect(PROTECTED.toolCamera.y + PROTECTED.toolCamera.h).toBe(ZONE.toolCamera.y + ZONE.toolCamera.h);
  });

  it('garde la vignette du terminal loin de l’incrustation', () => {
    expect(intersects(PIP.corner, PROTECTED.toolCamera)).toBe(false);
  });

  it('pose le sous-titre à gauche de l’incrustation tant qu’elle est allumée', () => {
    expect(intersects(captionBand(TOOL_CAM_CAPTION_WIDTH), PROTECTED.toolCamera)).toBe(false);
    // Et c'est bien nécessaire : le bandeau de largeur normale, lui, la recouvrirait.
    expect(intersects(captionBand(DEFAULT_STYLE.captionWidth), PROTECTED.toolCamera)).toBe(true);
  });

  it('laisse le bandeau étroit dans le bas gauche de la colonne spectateur', () => {
    const band = captionBand(TOOL_CAM_CAPTION_WIDTH);
    expect(band.x).toBeGreaterThanOrEqual(SPECTATOR_COLUMN.x);
    expect(band.x + band.w).toBeLessThanOrEqual(ZONE.toolCamera.x);
    expect(band.y + band.h).toBeLessThanOrEqual(PROTECTED.blockDiagram.y);
  });

  it('garde le bandeau de largeur normale comme zone protégée par défaut', () => {
    expect(PROTECTED.captionBand).toEqual(captionBand(DEFAULT_STYLE.captionWidth));
  });
});
