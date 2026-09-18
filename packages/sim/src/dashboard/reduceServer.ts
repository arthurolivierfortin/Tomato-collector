import { CAMERA_IDS, type CameraId, type ServerToDashboard } from '@tomato/shared';
import type { Counters, DashboardState, TraceEntry } from './dashboardTypes';
import {
  episodeEndTitle, episodeStartTitle, eventTitle, firstLine, phaseTitle, snapshotTitle, toolTitle, viewsTitle,
} from './traceFormat';

/** Nombre maximal d'entrées conservées dans la trace (spec : 200). */
export const TRACE_MAX = 200;
/** Longueur maximale du titre d'un texte de l'agent ; le reste va dans `detail`. */
export const TEXT_TITLE_MAX = 160;

type EntryInput = Omit<TraceEntry, 'id' | 'atMs'>;

/** Ajoute une entrée en tête de trace (plus récent en haut) et coupe à TRACE_MAX. */
function push(state: DashboardState, entry: EntryInput, nowMs: number): DashboardState {
  const full: TraceEntry = { ...entry, id: state.nextTraceId, atMs: nowMs };
  return { ...state, nextTraceId: state.nextTraceId + 1, trace: [full, ...state.trace].slice(0, TRACE_MAX) };
}

const isCameraId = (v: unknown): v is CameraId => typeof v === 'string' && (CAMERA_IDS as readonly string[]).includes(v);

/**
 * Caméra mise en avant par un appel d'outil : `move_camera` la nomme, `get_views` avec une seule caméra
 * la désigne. Une demande des trois vues ne privilégie rien : la mise en avant ne bouge pas (null).
 */
export function requestedCamera(tool: string, args: Record<string, unknown>): CameraId | null {
  if (tool === 'move_camera') return isCameraId(args['camera']) ? args['camera'] : null;
  if (tool !== 'get_views') return null;
  const cams = args['cameras'];
  return Array.isArray(cams) && cams.length === 1 && isCameraId(cams[0]) ? cams[0] : null;
}

/** Réducteur pur des messages serveur → dashboard. `nowMs` horodate la trace et les flashs. */
export function reduceServer(state: DashboardState, m: ServerToDashboard, nowMs: number): DashboardState {
  switch (m.type) {
    case 'snapshot': {
      const episode =
        m.episodeId === null
          ? null
          : state.episode?.id === m.episodeId
            ? state.episode
            : { id: m.episodeId, tomatoId: m.state.targetTomatoId ?? -1, startedAtMs: nowMs };
      const sim = { simTimeS: m.state.simTimeS, timeScale: m.state.timeScale, paused: m.state.paused };
      return push({ ...state, phase: m.phase, phaseAtMs: nowMs, episode, sim }, { kind: 'event', title: snapshotTitle(m.phase) }, nowMs);
    }
    case 'phase':
      return push({ ...state, phase: m.phase, phaseAtMs: nowMs }, { kind: 'phase', title: phaseTitle(m.phase), detail: m.reason }, nowMs);
    case 'episode_start':
      return push(
        { ...state, episode: { id: m.episodeId, tomatoId: m.tomatoId, startedAtMs: nowMs } },
        { kind: 'event', title: episodeStartTitle(m) },
        nowMs,
      );
    case 'episode_end': {
      const counters: Counters = { ...state.counters };
      counters[m.outcome] += 1;
      return push(
        { ...state, counters, costUsd: state.costUsd + m.costUsd, episode: null },
        { kind: 'event', title: episodeEndTitle(m), detail: m.note, ok: m.outcome === 'harvested', durationMs: m.durationMs },
        nowMs,
      );
    }
    case 'agent_text': {
      const text = m.text.trim();
      const title = firstLine(text, TEXT_TITLE_MAX);
      return push(state, title === text ? { kind: 'text', title } : { kind: 'text', title, detail: text }, nowMs);
    }
    case 'tool_call_start': {
      const camera = requestedCamera(m.tool, m.args);
      const featured = camera ?? state.featured;
      return push({ ...state, featured }, { kind: 'tool', title: toolTitle(m.tool, m.args), callId: m.callId, tool: m.tool, args: m.args }, nowMs);
    }
    case 'tool_call_result': {
      const idx = state.trace.findIndex((e) => e.kind === 'tool' && e.callId === m.callId);
      const prev = idx === -1 ? undefined : state.trace[idx];
      const result = m.result === undefined ? {} : { result: m.result };
      if (prev === undefined) {
        return push(state, { kind: 'tool', title: m.summary, ok: m.ok, durationMs: m.durationMs, callId: m.callId, ...result }, nowMs);
      }
      const trace = state.trace.slice();
      trace[idx] = { ...prev, ok: m.ok, durationMs: m.durationMs, detail: m.summary, ...result };
      return { ...state, trace };
    }
    case 'views': {
      // Fusion par caméra : un message partiel (move_camera n'en rend qu'une) ne doit jamais effacer les autres.
      const views = { ...state.views };
      const viewsAt = { ...state.viewsAt };
      for (const img of m.result.images) {
        views[img.camera] = img;
        viewsAt[img.camera] = nowMs;
      }
      const only = m.result.images.length === 1 ? m.result.images[0]?.camera : undefined;
      const sim = { ...state.sim, simTimeS: m.result.json.simTimeS };
      const title = viewsTitle(m.result.images.map((i) => i.camera));
      return push({ ...state, views, viewsAt, featured: only ?? state.featured, lastViewsAt: nowMs, sim }, { kind: 'event', title }, nowMs);
    }
    case 'sim_event':
      return push(
        state,
        m.event.type === 'tomato_landed'
          ? { kind: 'event', title: eventTitle(m.event), ok: m.event.inBasket }
          : { kind: 'event', title: eventTitle(m.event) },
        nowMs,
      );
    case 'block_activity':
      return { ...state, blocks: { active: m.to, flow: { from: m.from, to: m.to, label: m.label }, atMs: nowMs } };
  }
  // Messages que ce réducteur ne traite pas encore (agent_raw, agent_wake de l'issue #23, partie C).
  return state;
}
