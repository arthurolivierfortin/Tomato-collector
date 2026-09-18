import type { Vec2 } from '@tomato/shared';
import { FONT_PX } from './palette';

export type TextAlign = 'left' | 'center' | 'right';

/**
 * Commande de dessin en pixels ; produite par les couches d'annotation, exécutée par drawOverlay.
 * `group` réunit une étiquette et ses accessoires (cadre du badge, amorce qui la relie à son objet) :
 * la passe `spreadLabelGroups` les décale ensemble pour qu'aucun texte n'en recouvre un autre.
 */
export type OverlayCommand =
  | { kind: 'line'; from: Vec2; to: Vec2; color: string; width: number; group?: string }
  | { kind: 'dashedLine'; from: Vec2; to: Vec2; color: string; width: number; dash: Vec2; group?: string }
  | { kind: 'circle'; center: Vec2; radiusPx: number; color: string; width: number; fill?: string; group?: string }
  | { kind: 'cross'; center: Vec2; sizePx: number; color: string; width: number; group?: string }
  | { kind: 'rect'; from: Vec2; to: Vec2; color: string; width: number; fill?: string; group?: string }
  | { kind: 'polygon'; points: readonly Vec2[]; color: string; width: number; group?: string }
  | { kind: 'text'; at: Vec2; text: string; color: string; sizePx: number; align: TextAlign; halo: boolean; group?: string };

export type OverlayKind = OverlayCommand['kind'];

export const line = (from: Vec2, to: Vec2, color: string, width = 1, group?: string): OverlayCommand =>
  group === undefined ? { kind: 'line', from, to, color, width } : { kind: 'line', from, to, color, width, group };

/** Amorce fine qui relie un objet à son étiquette quand celle-ci a été décalée. */
export const leader = (from: Vec2, to: Vec2, color: string, group: string): OverlayCommand => line(from, to, color, 1, group);

export const text = (
  at: Vec2,
  value: string,
  color: string,
  sizePx: number = FONT_PX,
  align: TextAlign = 'left',
  group?: string,
): OverlayCommand =>
  group === undefined
    ? { kind: 'text', at, text: value, color, sizePx, align, halo: true }
    : { kind: 'text', at, text: value, color, sizePx, align, halo: true, group };
