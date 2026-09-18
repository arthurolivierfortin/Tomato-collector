import { parseMessage, type CameraId, type ServerToDashboard, type ServerToSim, type SimToServer, type ViewsResult } from '@tomato/shared';
import type { SimRuntime } from '../core/runtime';
import { emptyViews } from './viewsFallback';

export type BridgeStatus = 'connected' | 'disconnected';

export interface Bridge {
  onServerMessage(fn: (m: ServerToDashboard) => void): () => void;
  status(): BridgeStatus;
  onStatus(fn: (s: BridgeStatus) => void): () => void;
  close(): void;
}

/** Sous-ensemble de WebSocket utilisé par le bridge ; injectable dans les tests Node. */
export interface SocketLike {
  readonly readyState: number;
  send(data: string): void;
  close(): void;
  onopen: (() => void) | null;
  onmessage: ((ev: { data: unknown }) => void) | null;
  onclose: (() => void) | null;
  onerror: (() => void) | null;
}

export type SocketFactory = (url: string) => SocketLike;

export interface BridgeOptions {
  url: string;
  runtime: SimRuntime;
  renderViews: (cameras: CameraId[]) => Promise<ViewsResult>;
  socketFactory?: SocketFactory;
  reconnectMs?: number;
  stateIntervalMs?: number;
}

export const RECONNECT_MS = 2000;
/** 5 Hz. */
export const STATE_INTERVAL_MS = 200;
const OPEN = 1;

const DASHBOARD_TYPES: ReadonlySet<string> = new Set([
  'snapshot', 'phase', 'episode_start', 'episode_end', 'agent_text', 'tool_call_start', 'tool_call_result', 'views', 'sim_event', 'block_activity',
]);

/** Adapte le WebSocket du navigateur à SocketLike (les types DOM ne sont pas directement assignables). */
export const browserSocketFactory: SocketFactory = (url) => {
  const ws = new WebSocket(url);
  const s: SocketLike = {
    get readyState() {
      return ws.readyState;
    },
    send: (data) => ws.send(data),
    close: () => ws.close(),
    onopen: null, onmessage: null, onclose: null, onerror: null,
  };
  ws.onopen = () => s.onopen?.();
  ws.onmessage = (ev: MessageEvent<unknown>) => s.onmessage?.({ data: ev.data });
  ws.onclose = () => s.onclose?.();
  ws.onerror = () => s.onerror?.();
  return s;
};

/**
 * Client WebSocket de la page sim : hello, état à 5 Hz (et après chaque action), réponses aux commandes du serveur,
 * relais des événements, reconnexion automatique ; les messages destinés au dashboard sont republiés localement.
 */
export function createBridge(opts: BridgeOptions): Bridge {
  const factory = opts.socketFactory ?? browserSocketFactory;
  const reconnectMs = opts.reconnectMs ?? RECONNECT_MS;
  const intervalMs = opts.stateIntervalMs ?? STATE_INTERVAL_MS;
  const store = opts.runtime.ctx.store;
  const messageListeners = new Set<(m: ServerToDashboard) => void>();
  const statusListeners = new Set<(s: BridgeStatus) => void>();
  let socket: SocketLike | null = null;
  let status: BridgeStatus = 'disconnected';
  let closed = false;
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  let stateTimer: ReturnType<typeof setTimeout> | null = null;
  let lastStateAt = Number.NEGATIVE_INFINITY;

  const send = (m: SimToServer): boolean => {
    if (socket === null || socket.readyState !== OPEN) return false;
    socket.send(JSON.stringify(m));
    return true;
  };

  const sendState = (): void => {
    if (stateTimer !== null) {
      clearTimeout(stateTimer);
      stateTimer = null;
    }
    lastStateAt = Date.now();
    send({ type: 'state', state: store.get() });
  };

  /** Envoi immédiat si le dernier date de plus de 200 ms, sinon un seul envoi différé (le dernier état gagne). */
  const scheduleState = (): void => {
    if (stateTimer !== null) return;
    const wait = intervalMs - (Date.now() - lastStateAt);
    if (wait <= 0) {
      sendState();
      return;
    }
    stateTimer = setTimeout(sendState, wait);
  };

  const setStatus = (s: BridgeStatus): void => {
    if (status === s) return;
    status = s;
    for (const fn of statusListeners) fn(s);
  };

  const handleCommand = (m: ServerToSim): void => {
    if (m.type === 'apply_action') {
      send({ type: 'action_result', requestId: m.requestId, result: opts.runtime.apply(m.action) });
      sendState();
      return;
    }
    opts.renderViews(m.cameras).then(
      (result) => send({ type: 'views_result', requestId: m.requestId, result }),
      () => send({ type: 'views_result', requestId: m.requestId, result: emptyViews(store.get()) }),
    );
  };

  const onMessage = (raw: unknown): void => {
    const m = parseMessage(String(raw));
    if (m === null) return;
    if (m.type === 'apply_action' || m.type === 'render_views') handleCommand(m);
    else if (DASHBOARD_TYPES.has(m.type)) for (const fn of messageListeners) fn(m as ServerToDashboard);
  };

  const connect = (): void => {
    if (closed) return;
    reconnectTimer = null;
    const s = factory(opts.url);
    socket = s;
    s.onopen = () => {
      setStatus('connected');
      send({ type: 'hello', role: 'sim' });
      sendState();
    };
    s.onmessage = (ev) => onMessage(ev.data);
    s.onerror = () => undefined; // le navigateur enchaîne toujours par onclose
    s.onclose = () => {
      if (socket !== s) return;
      socket = null;
      setStatus('disconnected');
      if (!closed) reconnectTimer = setTimeout(connect, reconnectMs);
    };
  };

  const unsubscribeStore = store.subscribe(scheduleState);
  const unsubscribeEvents = opts.runtime.onEvent((event) => {
    send({ type: 'sim_event', event });
  });
  connect();

  return {
    onServerMessage(fn) {
      messageListeners.add(fn);
      return () => messageListeners.delete(fn);
    },
    status: () => status,
    onStatus(fn) {
      statusListeners.add(fn);
      return () => statusListeners.delete(fn);
    },
    close() {
      closed = true;
      if (reconnectTimer !== null) clearTimeout(reconnectTimer);
      if (stateTimer !== null) clearTimeout(stateTimer);
      unsubscribeStore();
      unsubscribeEvents();
      const s = socket;
      socket = null;
      s?.close();
      setStatus('disconnected');
    },
  };
}
