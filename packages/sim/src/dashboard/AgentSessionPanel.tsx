import { useEffect, useRef } from 'react';
import { RAW_KIND_COLOR, RAW_KIND_LABEL, formatRawTime, rawBaseMs, type RawLine } from './rawLines';

interface Props {
  raw: readonly RawLine[];
  /** Instant du réveil : origine des horodatages relatifs (null tant qu'il n'y en a pas eu). */
  sinceMs: number | null;
  open: boolean;
  onToggle: () => void;
}

/**
 * Panneau « Session agent (brut) » (issue #23) : le flux `agent_raw` tel quel, façon terminal, sous la
 * trace. Le spectateur voit l'agent travailler, pas seulement le résumé. Plus ancien en haut, défilement
 * automatique tant qu'on est en bas, plafonné par le store (`RAW_MAX`). Touche `t` pour replier.
 */
export function AgentSessionPanel({ raw, sinceMs, open, onToggle }: Props) {
  const list = useRef<HTMLOListElement>(null);
  const last = raw[raw.length - 1]?.id ?? 0;
  useEffect(() => {
    const el = list.current;
    if (el === null) return;
    // Défilement automatique seulement si le spectateur n'a pas remonté le flux lui-même.
    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
    if (atBottom) el.scrollTop = el.scrollHeight;
  }, [last, open]);

  const base = rawBaseMs(sinceMs, raw);
  return (
    <section aria-label="Session agent (brut)" className="flex shrink-0 flex-col border-t border-line bg-black/50">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        aria-controls="agent-session-lines"
        className="flex h-7 shrink-0 items-center gap-2 px-3 text-[12px] text-ink-dim hover:text-ink"
      >
        <span aria-hidden="true">{open ? '▾' : '▸'}</span>
        Session agent (brut) (t)
        <span className="ml-auto font-mono text-[11px]">{raw.length} lignes</span>
      </button>
      {open && (
        <ol id="agent-session-lines" data-testid="agent-session" ref={list} className="h-[13rem] overflow-y-auto px-3 pb-2 font-mono text-[11px] leading-[1.45]">
          {raw.length === 0 && <li className="py-2 text-ink-dim">En attente du flux de la session agent.</li>}
          {raw.map((line) => (
            <li key={line.id} data-kind={line.kind} className="flex gap-2">
              <span className="shrink-0 tabular-nums text-ink-dim/70">{formatRawTime(line.atMs, base)}</span>
              <span className={`shrink-0 ${RAW_KIND_COLOR[line.kind]}`}>{RAW_KIND_LABEL[line.kind]}</span>
              <span className={`min-w-0 whitespace-pre-wrap break-all ${line.kind === 'stderr' ? 'text-ripe' : 'text-ink'}`}>{line.text}</span>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
