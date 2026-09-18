import { PHASES, type Phase } from '@tomato/shared';
import type { Connection, DashboardState, SimClock } from './dashboardTypes';
import { PHASE_LABEL, formatCost, formatNum } from './traceFormat';

/** Pastille active : la couleur dit la phase (palette de la spec), rien d'autre n'est coloré. */
const PHASE_ACTIVE: Record<Phase, string> = {
  idle: 'bg-ink-dim text-panel',
  detected: 'bg-turning text-panel',
  harvesting: 'bg-stem text-panel',
  cutting: 'bg-scissors text-panel',
  falling: 'bg-basket text-panel',
  harvested: 'bg-unripe text-panel',
  missed: 'bg-ripe text-ink',
  aborted: 'bg-axes text-panel',
};

const CONNECTION_LABEL: Record<Connection, string> = { connected: 'serveur connecté', disconnected: 'hors ligne', replay: 'replay' };
const CONNECTION_DOT: Record<Connection, string> = { connected: 'bg-unripe', disconnected: 'bg-ripe', replay: 'bg-basket' };

function Cell({ label, value, testId }: { label: string; value: string; testId: string }) {
  return (
    <div className="flex items-baseline gap-1.5 border-l border-line pl-4">
      <span className="text-ink-dim">{label}</span>
      <span className="font-mono tabular-nums text-ink" data-testid={testId}>
        {value}
      </span>
    </div>
  );
}

interface Props {
  state: DashboardState;
  /** Horloge de la sim locale ; null en lecture seule (on affiche alors celle du dernier snapshot). */
  clock: SimClock | null;
  detector: string;
}

export function StatusBar({ state, clock, detector }: Props) {
  const sim = clock ?? state.sim;
  return (
    <header data-testid="status-bar" className="flex h-11 shrink-0 items-center gap-4 border-b border-line bg-panel-2 px-4 text-[13px]">
      <div className="flex items-center gap-2" data-testid="connection">
        <span aria-hidden="true" className={`inline-block h-2 w-2 rounded-full ${CONNECTION_DOT[state.connection]}`} />
        <span className="text-ink-dim">{CONNECTION_LABEL[state.connection]}</span>
      </div>
      <ol aria-label="Phase" className="flex items-center gap-1">
        {PHASES.map((p) => {
          const active = p === state.phase;
          return (
            <li key={p}>
              <span aria-current={active ? 'step' : undefined} data-phase={p} className={`rounded-sm px-2 py-0.5 ${active ? PHASE_ACTIVE[p] : 'text-ink-dim'}`}>
                {PHASE_LABEL[p]}
              </span>
            </li>
          );
        })}
      </ol>
      <Cell label="récoltées" value={String(state.counters.harvested)} testId="count-harvested" />
      <Cell label="ratées" value={String(state.counters.missed)} testId="count-missed" />
      <Cell label="t sim" value={`${formatNum(sim.simTimeS, 1)} s`} testId="sim-time" />
      <Cell label="facteur" value={sim.paused ? 'pause' : `×${formatNum(sim.timeScale)}`} testId="time-scale" />
      <div className="ml-auto flex items-baseline gap-4">
        <Cell label="détecteur" value={detector} testId="detector" />
        <Cell label="modèle" value={state.model ?? '—'} testId="model" />
        <Cell label="coût" value={formatCost(state.costUsd)} testId="cost" />
      </div>
    </header>
  );
}
