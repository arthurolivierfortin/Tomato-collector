import type { PerceptionState } from '../perception/types';
import { AgentSessionPanel } from './AgentSessionPanel';
import type { DashboardState } from './dashboardTypes';
import { PerceptionPanel } from './PerceptionPanel';
import { TracePanel } from './TracePanel';

interface Props {
  state: DashboardState;
  perception: PerceptionState;
  isExpanded: (id: number) => boolean;
  onToggleTrace: (id: number) => void;
  onToggleSession: () => void;
  onTogglePerception: () => void;
  onOpenPipeline: () => void;
}

/**
 * Colonne du milieu : la trace de l'agent, sous elle le flux brut de sa session (issue #23), puis le
 * panneau « Perception » (issue #36). Ces panneaux vivent ici pour ne rien prendre à la vue spectateur
 * ni à la vue mise en avant (613 px).
 */
export function TraceColumn({ state, perception, isExpanded, onToggleTrace, onToggleSession, onTogglePerception, onOpenPipeline }: Props) {
  return (
    <div className="flex min-h-0 flex-col border-l border-line">
      <TracePanel trace={state.trace} isExpanded={isExpanded} onToggle={onToggleTrace} />
      <AgentSessionPanel raw={state.raw} sinceMs={state.rawSinceMs} open={state.ui.sessionOpen} onToggle={onToggleSession} />
      <PerceptionPanel state={perception} open={state.ui.perceptionOpen} live={state.connection !== 'replay'} onToggle={onTogglePerception} onOpenPipeline={onOpenPipeline} />
    </div>
  );
}
