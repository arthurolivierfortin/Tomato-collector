import type { TraceEntry, TraceKind } from './dashboardTypes';
import { formatClock, formatDuration } from './traceFormat';

const KIND_LABEL: Record<TraceKind, string> = { text: 'agent', tool: 'outil', event: 'événement', phase: 'phase' };

/** Bordure gauche = nature de la ligne ; fond teinté = erreur. */
function tone(entry: TraceEntry): string {
  if (entry.ok === false) return 'border-l-ripe bg-ripe/10';
  switch (entry.kind) {
    case 'phase':
      return 'border-l-stem';
    case 'tool':
      return 'border-l-scissors';
    case 'text':
      return 'border-l-ink-dim';
    case 'event':
      return 'border-l-line';
  }
}

function duration(entry: TraceEntry): string {
  if (entry.durationMs !== undefined) return formatDuration(entry.durationMs);
  return entry.kind === 'tool' && entry.ok === undefined ? '…' : '';
}

export function TraceRow({ entry }: { entry: TraceEntry }) {
  const error = entry.ok === false;
  return (
    <li
      data-kind={entry.kind}
      data-ok={entry.ok === undefined ? undefined : String(entry.ok)}
      className={`grid grid-cols-[auto_4.5rem_minmax(0,1fr)_auto] items-baseline gap-x-3 border-b border-l-2 border-line px-3 py-1.5 text-[13px] ${tone(entry)}`}
    >
      <time className="font-mono text-[11px] tabular-nums text-ink-dim">{formatClock(entry.atMs)}</time>
      <span className="text-[11px] text-ink-dim">{KIND_LABEL[entry.kind]}</span>
      <div className="min-w-0">
        <p className={`break-words ${error ? 'text-ripe' : 'text-ink'}`}>{entry.title}</p>
        {entry.detail !== undefined && entry.detail !== '' && (
          <p className={`whitespace-pre-line break-words text-[12px] ${error ? 'text-ripe/80' : 'text-ink-dim'}`}>{entry.detail}</p>
        )}
      </div>
      <span className="font-mono text-[11px] tabular-nums text-ink-dim">{duration(entry)}</span>
    </li>
  );
}
