import type { Vec2 } from '@tomato/shared';
import { FONT_PX } from './palette';

export type TextAlign = 'left' | 'center' | 'right';

/** Commande de dessin en pixels ; produite par les couches d'annotation, exécutée par drawOverlay. */
export type OverlayCommand =
  | { kind: 'line'; from: Vec2; to: Vec2; color: string; width: number }
  | { kind: 'dashedLine'; from: Vec2; to: Vec2; color: string; width: number; dash: Vec2 }
  | { kind: 'circle'; center: Vec2; radiusPx: number; color: string; width: number; fill?: string }
  | { kind: 'cross'; center: Vec2; sizePx: number; color: string; width: number }
  | { kind: 'rect'; from: Vec2; to: Vec2; color: string; width: number; fill?: string }
  | { kind: 'polygon'; points: readonly Vec2[]; color: string; width: number }
  | { kind: 'text'; at: Vec2; text: string; color: string; sizePx: number; align: TextAlign; halo: boolean };

export type OverlayKind = OverlayCommand['kind'];

export const line = (from: Vec2, to: Vec2, color: string, width = 1): OverlayCommand => ({ kind: 'line', from, to, color, width });

export const text = (at: Vec2, value: string, color: string, sizePx: number = FONT_PX, align: TextAlign = 'left'): OverlayCommand => ({
  kind: 'text', at, text: value, color, sizePx, align, halo: true,
});
