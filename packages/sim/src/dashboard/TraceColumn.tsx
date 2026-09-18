import { AgentSessionPanel } from './AgentSessionPanel';
import type { DashboardState } from './dashboardTypes';
import { TracePanel } from './TracePanel';

interface Props {
  state: DashboardState;
  isExpanded: (id: number) => boolean;
  onToggleTrace: (id: number) => void;
  onToggleSession: () => void;
}

/**
 * Colonne du milieu : la trace de l'agent, et sous elle le flux brut de sa session (issue #23).
 * Le panneau brut vit ici pour ne rien prendre à la vue spectateur ni à la vue mise en avant.
 */
export function TraceColumn({ state, isExpanded, onToggleTrace, onToggleSession }: Props) {
  return (
    <div className="flex min-h-0 flex-col border-l border-line">
      <TracePanel trace={state.trace} isExpanded={isExpanded} onToggle={onToggleTrace} />
      <AgentSessionPanel raw={state.raw} sinceMs={state.rawSinceMs} open={state.ui.sessionOpen} onToggle={onToggleSession} />
    </div>
  );
}
