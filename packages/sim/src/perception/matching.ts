import type { Vec2, Vec3 } from '@tomato/shared';
import type { Detection } from './types';

/** Distance maximale entre le centre d'une boîte et la projection d'une tomate, en fraction du grand côté. */
export const MATCH_RADIUS_FACTOR = 0.75;

export interface TomatoRef {
  id: number;
  positionCm: Vec3;
}

export interface Match {
  tomatoId: number;
  score: number;
  distancePx: number;
}

/**
 * Associe chaque détection `ripe` à la tomate dont le centre projeté est le plus proche du centre de la boîte,
 * si cette distance est inférieure à MATCH_RADIUS_FACTOR × max(w, h). Une tomate n'apparaît qu'une fois
 * (meilleur score). Résultat trié par score décroissant.
 */
export function matchDetections(
  detections: readonly Detection[],
  tomatoes: readonly TomatoRef[],
  project: (posCm: Vec3) => Vec2,
): Match[] {
  const projected = tomatoes.map((t) => ({ id: t.id, px: project(t.positionCm) }));
  const best = new Map<number, Match>();
  for (const d of detections) {
    if (d.label !== 'ripe') continue;
    const [x, y, w, h] = d.bbox;
    const cx = x + w / 2;
    const cy = y + h / 2;
    let nearest: { id: number; dist: number } | null = null;
    for (const t of projected) {
      const dist = Math.hypot(t.px[0] - cx, t.px[1] - cy);
      if (nearest === null || dist < nearest.dist) nearest = { id: t.id, dist };
    }
    if (nearest === null || nearest.dist > MATCH_RADIUS_FACTOR * Math.max(w, h)) continue;
    const previous = best.get(nearest.id);
    if (!previous || d.score > previous.score) best.set(nearest.id, { tomatoId: nearest.id, score: d.score, distancePx: nearest.dist });
  }
  return [...best.values()].sort((a, b) => b.score - a.score);
}
