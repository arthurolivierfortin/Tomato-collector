import type { BlockId } from '@tomato/shared';

export interface BlockSpec {
  id: BlockId;
  label: string;
}

/** Les cinq blocs de la spec (section 6), dans l'ordre du flux. */
export const BLOCKS: readonly BlockSpec[] = [
  { id: 'simulation', label: 'Simulation' },
  { id: 'perception', label: 'Perception' },
  { id: 'server', label: 'Serveur MCP' },
  { id: 'agent', label: 'Agent' },
  { id: 'dashboard', label: 'Dashboard' },
];

export const DIAGRAM_W = 1000;
export const DIAGRAM_H = 92;
export const BLOCK_W = 150;
export const BLOCK_H = 36;
export const BLOCK_Y = 8;
/** Ordonnée du bus d'événements. */
export const BUS_Y = 76;
export const BLOCK_GAP = (DIAGRAM_W - BLOCKS.length * BLOCK_W) / (BLOCKS.length + 1);

export function blockIndex(id: BlockId): number {
  return BLOCKS.findIndex((b) => b.id === id);
}

/** Abscisse gauche d'un bloc dans le viewBox. */
export function blockX(id: BlockId): number {
  return BLOCK_GAP + blockIndex(id) * (BLOCK_W + BLOCK_GAP);
}

export function blockCenterX(id: BlockId): number {
  return blockX(id) + BLOCK_W / 2;
}

/** Segment du bus allumé entre deux blocs, ordonné de gauche à droite. */
export function busSegment(from: BlockId, to: BlockId): { x1: number; x2: number } {
  const a = blockCenterX(from);
  const b = blockCenterX(to);
  return { x1: Math.min(a, b), x2: Math.max(a, b) };
}
