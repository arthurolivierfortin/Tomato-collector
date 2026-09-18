import { transition, type Phase, type SimEvent, type ToolName, type Vec3, type WakeDetector } from '@tomato/shared';
import type { EpisodeJournal } from '../episodes/journal';
import type { Hub } from '../hub/hub';
import { silentLogger, type Logger } from '../log';
import type { SimBridge } from '../sim/simBridge';
import { outcomeForPhase, phaseAfterLanding, phasesAfterToolResult, phasesToClose, type EpisodeOutcome } from './rules';

export interface SessionState {
  phase: Phase;
  episodeId: string | null;
  targetTomatoId: number | null;
  lastEvent: SimEvent | null;
  harvested: number;
  missed: number;
  toolCallsThisEpisode: number;
}

/** Qui a signalé la tomate, et à quel point il y croit (issue #23). */
export interface Detection {
  detector: WakeDetector;
  confidence: number;
}

/** Détection par défaut : un réveil déclenché à la main (`npm run wake`, API) n'a pas de détecteur. */
export const MANUAL_DETECTION: Detection = { detector: 'manual', confidence: 1 };

/** Réveil de l'agent (M6) : la tomate mûre à récolter, et ce qui l'a repérée. */
export interface WakeEvent extends Detection {
  tomatoId: number;
  positionCm: Vec3;
  ripeness: number;
}

/** Étiquette du bloc perception → serveur : « tomate #3 mûre, yolo 0,56 ». */
export function detectionLabel(tomatoId: number, d: Detection): string {
  return `tomate #${tomatoId} mûre, ${d.detector} ${d.confidence.toFixed(2).replace('.', ',')}`;
}

export interface Session {
  get(): SessionState;
  /** Via `transition` de shared ; transition invalide = journalisée, ignorée, false. */
  setPhase(to: Phase, reason: string): boolean;
  /** Ouvre un épisode (idle seulement) : journal, `detected`, `set_target`, réveil. Renvoie l'episodeId ou null. */
  startEpisode(tomatoId: number, detection?: Detection): string | null;
  /** Clôt l'épisode (l'issue réelle vient de la phase) puis rejoue une détection en attente. */
  endEpisode(outcome: EpisodeOutcome, note: string): void;
  onPhase(fn: (phase: Phase, reason: string) => void): () => void;
  /** Événements de la sim : diffusion, règles de phase, file d'attente des `ripe_detected`. */
  handleSimEvent(event: SimEvent): void;
  /** Incrémente le compteur d'appels de l'épisode et le renvoie (0 hors épisode). */
  noteToolCall(tool: ToolName): number;
  /** Applique les règles de phase liées au résultat d'un outil. */
  noteToolResult(tool: ToolName, ok: boolean): void;
  onWake(fn: (event: WakeEvent) => void): () => void;
  /** Tomates détectées mûres pendant un épisode, à traiter au retour en idle. */
  pendingDetections(): readonly number[];
}

export interface SessionDeps {
  sim: SimBridge;
  journal: EpisodeJournal;
  now?: () => number;
  log?: Logger;
}

/** `2026-09-17T10-22-33-512Z-t3` : horodatage sûr pour un nom de fichier + tomate. */
export function episodeIdFor(nowMs: number, tomatoId: number): string {
  return `${new Date(nowMs).toISOString().replace(/[:.]/g, '-')}-t${tomatoId}`;
}

export function createSession(hub: Hub, deps: SessionDeps): Session {
  const now = deps.now ?? Date.now;
  const log = deps.log ?? silentLogger;
  const state: SessionState = { phase: 'idle', episodeId: null, targetTomatoId: null, lastEvent: null, harvested: 0, missed: 0, toolCallsThisEpisode: 0 };
  const queue: (Detection & { tomatoId: number })[] = [];
  const phaseListeners = new Set<(phase: Phase, reason: string) => void>();
  const wakeListeners = new Set<(event: WakeEvent) => void>();
  let pendingClose: { outcome: EpisodeOutcome; note: string } | null = null;

  function setPhase(to: Phase, reason: string): boolean {
    let next: Phase;
    try {
      next = transition(state.phase, to);
    } catch {
      log(`session: transition refusée ${state.phase} → ${to} (${reason})`);
      return false;
    }
    state.phase = next;
    if (next === 'harvested') state.harvested += 1;
    if (next === 'missed') state.missed += 1;
    hub.broadcast({ type: 'phase', phase: next, reason });
    hub.broadcast({ type: 'block_activity', from: 'server', to: 'dashboard', label: `phase ${next}` });
    for (const fn of phaseListeners) fn(next, reason);
    return true;
  }

  function wakeEventFor(tomatoId: number, d: Detection): WakeEvent {
    const t = deps.sim.latestState()?.tomatoes.find((x) => x.id === tomatoId);
    return { tomatoId, positionCm: t?.positionCm ?? [0, 0, 0], ripeness: t?.ripeness ?? 1, ...d };
  }

  function startEpisode(tomatoId: number, detection: Detection = MANUAL_DETECTION): string | null {
    if (state.phase !== 'idle') {
      log(`session: startEpisode ignoré en phase ${state.phase}`);
      return null;
    }
    const episodeId = episodeIdFor(now(), tomatoId);
    state.episodeId = episodeId;
    state.targetTomatoId = tomatoId;
    state.toolCallsThisEpisode = 0;
    deps.journal.open(episodeId, tomatoId);
    setPhase('detected', `tomate ${tomatoId} mûre`);
    void deps.sim.apply({ type: 'set_target', tomatoId });
    // Le schéma bloc s'allume dans l'ordre : perception → serveur (déjà fait par handleSimEvent), puis serveur → agent.
    hub.broadcast({ type: 'block_activity', from: 'server', to: 'agent', label: 'réveil' });
    const event = wakeEventFor(tomatoId, detection);
    for (const fn of wakeListeners) fn(event);
    return episodeId;
  }

  function endEpisode(outcome: EpisodeOutcome, note: string): void {
    if (state.episodeId === null) {
      log('session: aucun épisode à clore');
      return;
    }
    const steps = phasesToClose(state.phase);
    if (steps === null) {
      pendingClose = { outcome, note };
      log(`session: clôture différée en phase ${state.phase}`);
      return;
    }
    const actual = outcomeForPhase(state.phase);
    const fullNote = actual === outcome ? note : `(déclaré ${outcome}) ${note}`;
    const toolCalls = state.toolCallsThisEpisode;
    for (const p of steps) setPhase(p, `épisode clos : ${actual}`);
    void deps.journal.close(actual, fullNote, toolCalls);
    state.episodeId = null;
    state.targetTomatoId = null;
    state.toolCallsThisEpisode = 0;
    pendingClose = null;
    void deps.sim.apply({ type: 'set_target', tomatoId: null });
    const next = queue.shift();
    if (next !== undefined) startEpisode(next.tomatoId, next);
  }

  function handleSimEvent(event: SimEvent): void {
    state.lastEvent = event;
    hub.broadcast({ type: 'sim_event', event });
    const detection: Detection | null =
      event.type === 'ripe_detected' ? { detector: event.detector, confidence: event.confidence } : null;
    hub.broadcast(
      event.type === 'ripe_detected' && detection !== null
        ? { type: 'block_activity', from: 'perception', to: 'server', label: detectionLabel(event.tomatoId, detection) }
        : { type: 'block_activity', from: 'simulation', to: 'server', label: event.type },
    );
    switch (event.type) {
      case 'ripe_detected':
        if (state.phase === 'idle') startEpisode(event.tomatoId, detection ?? MANUAL_DETECTION);
        else if (event.tomatoId !== state.targetTomatoId && !queue.some((q) => q.tomatoId === event.tomatoId)) {
          queue.push({ tomatoId: event.tomatoId, ...(detection ?? MANUAL_DETECTION) });
          log(`session: tomate ${event.tomatoId} mise en attente (phase ${state.phase})`);
        }
        return;
      case 'tomato_landed': {
        const p = phaseAfterLanding(state.phase, event.inBasket);
        if (p === null) {
          log(`session: tomato_landed ignoré en phase ${state.phase}`);
          return;
        }
        setPhase(p, `tomate ${event.tomatoId} ${event.inBasket ? 'dans le panier' : 'hors du panier'}`);
        if (pendingClose) endEpisode(pendingClose.outcome, pendingClose.note);
        return;
      }
      case 'plant_regenerated':
        queue.length = 0;
        return;
    }
  }

  return {
    get: () => ({ ...state }),
    setPhase,
    startEpisode,
    endEpisode,
    onPhase(fn) {
      phaseListeners.add(fn);
      return () => phaseListeners.delete(fn);
    },
    handleSimEvent,
    noteToolCall() {
      if (state.episodeId === null) return 0;
      state.toolCallsThisEpisode += 1;
      return state.toolCallsThisEpisode;
    },
    noteToolResult(tool, ok) {
      for (const p of phasesAfterToolResult(state.phase, tool, ok)) setPhase(p, `${tool} ${ok ? 'ok' : 'échec'}`);
    },
    onWake(fn) {
      wakeListeners.add(fn);
      return () => wakeListeners.delete(fn);
    },
    pendingDetections: () => queue.map((q) => q.tomatoId),
  };
}
