import { useCallback, useState } from 'react';
import { createFakeBridge } from '../bridge/fakeBridge';
import type { BridgeSlot } from './bridgeSlot';
import { SPEEDS } from './Controls';
import { listEpisodes, loadEpisode, scriptDurationMs, toScript, type EpisodeSummary } from './episodesApi';
import { formatDuration } from './traceFormat';
import { BTN, SELECT } from './ui';

type Status = { kind: 'idle' } | { kind: 'loading' } | { kind: 'playing'; durationMs: number } | { kind: 'error'; message: string };

function statusText(status: Status, count: number): string {
  switch (status.kind) {
    case 'idle':
      return count === 0 ? 'aucun épisode chargé' : `${count} épisode(s)`;
    case 'loading':
      return 'chargement…';
    case 'playing':
      return `lecture, ${formatDuration(status.durationMs)}`;
    case 'error':
      return `serveur injoignable (${status.message})`;
  }
}

function optionLabel(e: EpisodeSummary): string {
  const when = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(e.startedAt) ? e.startedAt.slice(11, 19) : e.startedAt;
  return `${when} ${e.outcome} (tomate ${e.tomatoId})`;
}

/** Replay : liste `GET /episodes`, lecture d'un épisode par un pont simulé à la vitesse choisie. */
export function ReplayPanel({ slot }: { slot: BridgeSlot }) {
  const [episodes, setEpisodes] = useState<EpisodeSummary[]>([]);
  const [selected, setSelected] = useState('');
  const [speed, setSpeed] = useState<number>(1);
  const [status, setStatus] = useState<Status>({ kind: 'idle' });

  const fail = (e: unknown): void => setStatus({ kind: 'error', message: e instanceof Error ? e.message : String(e) });

  const refresh = useCallback(async () => {
    setStatus({ kind: 'loading' });
    try {
      const list = await listEpisodes();
      setEpisodes(list);
      setSelected((current) => current || (list[0]?.episodeId ?? ''));
      setStatus({ kind: 'idle' });
    } catch (e) {
      fail(e);
    }
  }, []);

  const play = useCallback(async () => {
    if (selected === '') return;
    setStatus({ kind: 'loading' });
    try {
      const script = toScript(await loadEpisode(selected), speed);
      slot.play(createFakeBridge(script));
      setStatus({ kind: 'playing', durationMs: scriptDurationMs(script) });
    } catch (e) {
      fail(e);
    }
  }, [selected, speed, slot]);

  const stop = useCallback(() => {
    slot.stop();
    setStatus({ kind: 'idle' });
  }, [slot]);

  return (
    <div role="group" aria-label="Replay" className="flex items-center gap-1.5 border-l border-line pl-2">
      <button type="button" className={BTN} onClick={() => void refresh()} disabled={status.kind === 'loading'}>
        Épisodes
      </button>
      <select aria-label="Épisode à rejouer" className={SELECT} value={selected} onChange={(e) => setSelected(e.target.value)} disabled={episodes.length === 0}>
        {episodes.length === 0 && <option value="">aucun</option>}
        {episodes.map((e) => (
          <option key={e.episodeId} value={e.episodeId}>
            {optionLabel(e)}
          </option>
        ))}
      </select>
      <select aria-label="Vitesse de replay" className={`${SELECT} font-mono`} value={speed} onChange={(e) => setSpeed(Number(e.target.value))}>
        {SPEEDS.map((s) => (
          <option key={s} value={s}>
            ×{s}
          </option>
        ))}
      </select>
      <button type="button" className={BTN} onClick={() => void play()} disabled={selected === '' || status.kind === 'loading'}>
        Rejouer
      </button>
      <button type="button" className={BTN} onClick={stop} disabled={status.kind !== 'playing'}>
        Arrêter
      </button>
      <span className="text-[12px] text-ink-dim" aria-live="polite">
        {statusText(status, episodes.length)}
      </span>
    </div>
  );
}
