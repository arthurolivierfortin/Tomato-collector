import type { CameraId, CameraPose, TomatoView } from '@tomato/shared';
import { projectToPixel } from './ortho';
import { text, type OverlayCommand } from './overlayTypes';
import { FONT_PX_LARGE, PALETTE, TOMATO_STATE_COLOR } from './palette';

export const MARKER_RADIUS_PX = 14;
/** En dessous de cette fraction visible, la tomate porte le badge « occultée » (spec 4.5). */
export const OCCLUDED_BELOW = 0.5;
export const OCCLUDED_LABEL = 'occultée';
const TARGET_RING_EXTRA_PX = 5;
const LABEL_GAP_PX = 6;
const BADGE_CHAR_PX = 8;

const fmt = (v: number): string => v.toFixed(1);

/** Couche 3 : cercle numéroté par tomate, couleur d'état, XYZ en cm, badge d'occultation, anneau cyan sur la cible. */
export function markerCommands(
  camId: CameraId,
  pose: CameraPose,
  tomatoes: readonly TomatoView[],
  targetTomatoId: number | null,
): OverlayCommand[] {
  const out: OverlayCommand[] = [];
  for (const t of tomatoes) {
    const c = projectToPixel(camId, pose, t.positionCm);
    const color = TOMATO_STATE_COLOR[t.state];
    const isTarget = t.id === targetTomatoId;
    out.push({ kind: 'circle', center: c, radiusPx: MARKER_RADIUS_PX, color, width: isTarget ? 3 : 2 });
    if (isTarget) out.push({ kind: 'circle', center: c, radiusPx: MARKER_RADIUS_PX + TARGET_RING_EXTRA_PX, color: PALETTE.stem, width: 1.5 });
    out.push(text([c[0], c[1] + 5], String(t.id), color, FONT_PX_LARGE, 'center'));
    const [x, y, z] = t.positionCm;
    const lx = c[0] + MARKER_RADIUS_PX + LABEL_GAP_PX;
    out.push(text([lx, c[1] - 2], `#${t.id} ${t.state} (${fmt(x)}, ${fmt(y)}, ${fmt(z)})`, color));
    const visible = t.visibleIn[camId];
    if (visible < OCCLUDED_BELOW) {
      const label = `${OCCLUDED_LABEL} ${Math.round(visible * 100)} %`;
      const w = label.length * BADGE_CHAR_PX + 10;
      out.push({ kind: 'rect', from: [lx, c[1] + 4], to: [lx + w, c[1] + 22], color: PALETTE.warn, width: 1, fill: PALETTE.halo });
      out.push(text([lx + 5, c[1] + 17], label, PALETTE.warn));
    }
  }
  return out;
}
