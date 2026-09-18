import type { TraceEntry, TraceKind } from './dashboardTypes';
import { JsonBlock } from './JsonBlock';
import { formatClock, formatDuration } from './traceFormat';
import { formatToolArgs, formatToolResult } from './traceJson';

const KIND_LABEL: Record<TraceKind, string> = { text: 'agent', tool: 'outil', event: 'événement', phase: 'phase' };

/** Un appel d'outil sans résultat : il est en cours, surligné, avec un chrono qui tourne. */
export const isPending = (entry: TraceEntry): boolean => entry.kind === 'tool' && entry.ok === undefined;

/** Bordure gauche = nature de la ligne ; fond teinté = erreur ou appel en cours. */
function tone(entry: TraceEntry): string {
  if (entry.ok === false) return 'border-l-ripe bg-ripe/10';
  if (isPending(entry)) return 'border-l-scissors bg-scissors/10';
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

interface Props {
  entry: TraceEntry;
  expanded: boolean;
  onToggle: (id: number) => void;
  nowMs: number;
}

export function TraceRow({ entry, expanded, onToggle, nowMs }: Props) {
  const error = entry.ok === false;
  const pending = isPending(entry);
  const foldable = entry.tool !== undefined;
  const argsJson = entry.args === undefined ? '' : formatToolArgs(entry.args);
  const resultJson = formatToolResult(entry.result);

  return (
    <li
      data-kind={entry.kind}
      data-ok={entry.ok === undefined ? undefined : String(entry.ok)}
      data-pending={pending ? 'true' : undefined}
      className={`grid grid-cols-[auto_4.5rem_minmax(0,1fr)_auto_auto] items-baseline gap-x-3 border-b border-l-2 border-line px-3 py-1.5 text-[13px] ${tone(entry)}`}
    >
      <time className="font-mono text-[11px] tabular-nums text-ink-dim">{formatClock(entry.atMs)}</time>
      <span className="text-[11px] text-ink-dim">{KIND_LABEL[entry.kind]}</span>
      <div className="min-w-0">
        <p className={`break-words ${error ? 'text-ripe' : 'text-ink'}`}>{entry.title}</p>
        {entry.detail !== undefined && entry.detail !== '' && (
          <p data-testid={`trace-text-${entry.id}`} className={`whitespace-pre-wrap break-words text-[12px] ${error ? 'text-ripe/80' : 'text-ink-dim'}`}>
            {entry.detail}
          </p>
        )}
        {foldable && expanded && (
          <>
            {argsJson !== '' && <JsonBlock json={argsJson} label="arguments" testId={`trace-args-${entry.id}`} />}
            {resultJson !== '' && <JsonBlock json={resultJson} label="résultat" testId={`trace-result-${entry.id}`} />}
          </>
        )}
      </div>
      {foldable ? (
        <button
          type="button"
          aria-expanded={expanded}
          aria-label={`${expanded ? 'Replier' : 'Déplier'} le JSON de ${entry.tool}`}
          onClick={() => onToggle(entry.id)}
          className="rounded-sm border border-line px-1.5 text-[11px] text-ink-dim hover:border-axes hover:text-ink focus-visible:outline focus-visible:outline-stem"
        >
          {expanded ? '−' : '+'}
        </button>
      ) : (
        <span />
      )}
      <span className={`font-mono text-[11px] tabular-nums ${pending ? 'text-scissors' : 'text-ink-dim'}`}>
        {pending ? formatDuration(Math.max(0, nowMs - entry.atMs)) : entry.durationMs !== undefined ? formatDuration(entry.durationMs) : ''}
      </span>
    </li>
  );
}
