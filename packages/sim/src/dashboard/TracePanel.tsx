import type { TraceEntry } from './dashboardTypes';
import { TraceRow } from './TraceRow';
import { useNow } from './useNow';

interface Props {
  trace: TraceEntry[];
  /** Un appel d'outil déplié montre ses arguments et son résultat en JSON. */
  isExpanded: (id: number) => boolean;
  onToggle: (id: number) => void;
  /** Horloge figée (tests, captures) ; sinon l'heure courante, rafraîchie pour le chrono des appels en cours. */
  nowMs?: number;
}

/** Trace de l'agent, plus récent en haut (le store garantit l'ordre et le plafond). */
export function TracePanel({ trace, isExpanded, onToggle, nowMs }: Props) {
  const now = useNow(nowMs);
  return (
    <section aria-label="Trace de l'agent" className="flex min-h-0 flex-col border-l border-line">
      <h2 className="shrink-0 border-b border-line px-3 py-1.5 text-[12px] text-ink-dim">Trace de l&apos;agent, plus récent en haut</h2>
      <ol data-testid="trace" className="min-h-0 flex-1 overflow-y-auto">
        {trace.length === 0 && <li className="px-3 py-2 text-[12px] text-ink-dim">En attente d&apos;un épisode.</li>}
        {trace.map((entry) => (
          <TraceRow key={entry.id} entry={entry} expanded={isExpanded(entry.id)} onToggle={onToggle} nowMs={now} />
        ))}
      </ol>
    </section>
  );
}
