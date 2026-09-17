import type { TomatoState } from '@tomato/shared';

/** Palette de la spec (section 6) et du contrat Étape 2. */
export const PALETTE = {
  ripe: '#c8261b',
  turning: '#e08a1e',
  unripe: '#3f9a3a',
  stem: '#22d3ee',
  bladeAxis: '#e879f9',
  bladeNormal: '#93c5fd',
  basket: '#facc15',
  edges: '#ffffff',
  grid: 'rgba(255,255,255,0.25)',
  axes: '#9ca3af',
  text: '#f5f5f5',
  halo: 'rgba(0,0,0,0.8)',
  band: 'rgba(0,0,0,0.7)',
  fall: '#ffffff',
  warn: '#fb923c',
} as const;

export const TOMATO_STATE_COLOR: Record<TomatoState, string> = {
  unripe: PALETTE.unripe,
  turning: PALETTE.turning,
  ripe: PALETTE.ripe,
};

/** Tailles de police minimales pour rester lisibles sur un PNG de 800 px. */
export const FONT_PX = 13;
export const FONT_PX_LARGE = 15;
