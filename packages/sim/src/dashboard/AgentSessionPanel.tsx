import { memo, useEffect, useRef } from 'react';
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
 *
 * `memo` : le dashboard se redessine à chaque battement d'horloge et à chaque pour cent de maturité,
 * alors que ce panneau ne change qu'à l'arrivée d'une ligne. Ses props sont stables (tableau du store,
 * primitives, rappel mémoïsé), donc la comparaison superficielle suffit.
 */
export const AgentSessionPanel = memo(function AgentSessionPanel({ raw, sinceMs, open, onToggle }: Props) {
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
    // Ouvert, le panneau prend la hauteur que la trace lui laisse (jamais moins de 20 rem) : à 11 px
    // sur 13 rem, la revue de tournage ne lisait que huit lignes. Replié, il ne garde que son en-tête.
    <section
      aria-label="Session agent (brut)"
      className={`flex flex-col border-t border-line bg-black/50 ${open ? 'min-h-[20rem] flex-1' : 'shrink-0'}`}
    >
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
        <ol id="agent-session-lines" data-testid="agent-session" ref={list} className="min-h-0 flex-1 overflow-y-auto px-3 pb-2 font-mono text-[12.5px] leading-[1.5]">
          {raw.length === 0 && <li className="py-2 text-ink-dim">En attente du flux de la session agent.</li>}
          {raw.map((line) => (
            <li key={line.id} data-kind={line.kind} className="flex gap-2">
              <span className="shrink-0 tabular-nums text-ink-dim/70">{formatRawTime(line.atMs, base)}</span>
              <span className={`shrink-0 ${RAW_KIND_COLOR[line.kind]}`}>{RAW_KIND_LABEL[line.kind]}</span>
              <span className={`min-w-0 whitespace-pre-wrap break-words ${line.kind === 'stderr' ? 'text-ripe' : 'text-ink'}`}>{line.text}</span>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
});
