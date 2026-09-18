import { useEffect } from 'react';
import type { BlockId } from '@tomato/shared';
import { BLOCKS, BLOCK_H, BLOCK_W, BLOCK_Y, BUS_Y, DIAGRAM_H, DIAGRAM_W, blockCenterX, blockX, busSegment } from './blockLayout';
import { advanceTimerMs, type BlockQueue } from './blockQueue';

interface Props {
  queue: BlockQueue;
  /** Un épisode est en cours : le bloc « Agent » reste allumé du réveil au rapport (issue #23). */
  episodeActive: boolean;
  open: boolean;
  onToggle: () => void;
  /** Fait avancer la file quand l'activité en cours a tenu sa durée minimale. */
  onAdvance: () => void;
}

/**
 * Bandeau bas repliable : Simulation → Perception → Serveur MCP → Agent → Dashboard sur un bus d'événements.
 *
 * Les activités s'allument une par une, au moins `BLOCK_MIN_MS` chacune (`blockQueue`) : la séquence
 * perception → serveur puis serveur → agent se lit au lieu de clignoter.
 */
export function BlockDiagram({ queue, episodeActive, open, onToggle, onAdvance }: Props) {
  const lit = queue.current;
  useEffect(() => {
    const due = advanceTimerMs(queue, Date.now());
    if (due === null) return;
    const timer = setTimeout(onAdvance, due);
    return () => clearTimeout(timer);
  }, [queue, onAdvance]);

  const flow = lit?.flow ?? null;
  const seg = flow ? busSegment(flow.from, flow.to) : null;
  const toX = flow ? blockCenterX(flow.to) : 0;
  const label = flow ?? queue.last;
  const isActive = (id: BlockId): boolean => id === flow?.to || (episodeActive && id === 'agent');
  return (
    <footer data-testid="block-diagram" className="shrink-0 border-t border-line bg-panel-2 pb-2">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        aria-controls="block-diagram-svg"
        className="flex h-7 w-full items-center gap-2 px-4 text-[12px] text-ink-dim hover:text-ink"
      >
        <span aria-hidden="true">{open ? '▾' : '▸'}</span>
        Schéma bloc (b)
        {label && (
          <span className="ml-auto font-mono text-[11px]" data-testid="block-last-flow">
            {label.from} → {label.to} : {label.label}
            {queue.pending.length > 0 && ` (+${queue.pending.length})`}
          </span>
        )}
      </button>
      {open && (
        <svg
          id="block-diagram-svg"
          viewBox={`0 0 ${DIAGRAM_W} ${DIAGRAM_H}`}
          role="img"
          aria-label="Simulation, Perception, Serveur MCP, Agent et Dashboard reliés par le bus d'événements"
          className="block h-[92px] w-full"
        >
          <line x1={blockCenterX('simulation')} x2={blockCenterX('dashboard')} y1={BUS_Y} y2={BUS_Y} stroke="var(--color-line)" strokeWidth={2} />
          {seg && flow && (
            <g data-testid="block-flow">
              <line x1={seg.x1} x2={seg.x2} y1={BUS_Y} y2={BUS_Y} stroke="var(--color-stem)" strokeWidth={3} />
              <text x={(seg.x1 + seg.x2) / 2} y={BUS_Y - 6} textAnchor="middle" fill="var(--color-stem)" fontSize={11} fontFamily="var(--font-mono)">
                {flow.label}
              </text>
              <polygon points={`${toX - 6},${BLOCK_Y + BLOCK_H + 12} ${toX + 6},${BLOCK_Y + BLOCK_H + 12} ${toX},${BLOCK_Y + BLOCK_H + 2}`} fill="var(--color-stem)" />
            </g>
          )}
          {BLOCKS.map((b) => {
            const on = isActive(b.id);
            const cx = blockCenterX(b.id);
            return (
              <g key={b.id} data-block={b.id} data-active={on ? 'true' : undefined}>
                <line x1={cx} x2={cx} y1={BLOCK_Y + BLOCK_H} y2={BUS_Y} stroke={on ? 'var(--color-stem)' : 'var(--color-line)'} strokeWidth={on ? 2 : 1} />
                <rect
                  x={blockX(b.id)}
                  y={BLOCK_Y}
                  width={BLOCK_W}
                  height={BLOCK_H}
                  rx={3}
                  fill={on ? 'var(--color-stem)' : 'var(--color-panel)'}
                  stroke={on ? 'var(--color-stem)' : 'var(--color-axes)'}
                />
                <text x={cx} y={BLOCK_Y + BLOCK_H / 2 + 4} textAnchor="middle" fontSize={13} fill={on ? 'var(--color-panel)' : 'var(--color-ink)'}>
                  {b.label}
                </text>
              </g>
            );
          })}
        </svg>
      )}
    </footer>
  );
}
