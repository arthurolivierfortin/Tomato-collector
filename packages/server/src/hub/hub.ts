import { createDefaultWorld, parseMessage, type ClientRole, type ServerToDashboard, type ServerToSim, type SimToServer } from '@tomato/shared';
import { WebSocket, WebSocketServer } from 'ws';
import { silentLogger, type Logger } from '../log';

export type Snapshot = Extract<ServerToDashboard, { type: 'snapshot' }>;

export interface Hub {
  onSimMessage(fn: (m: SimToServer) => void): () => void;
  /** false si aucun client sim n'est connecté. */
  sendToSim(m: ServerToSim): boolean;
  /** Vers TOUS les clients connectés (la page sim est aussi le dashboard). */
  broadcast(m: ServerToDashboard): void;
  simConnected(): boolean;
  close(): Promise<void>;
  /** Observe tout ce qui est diffusé (journal des épisodes). */
  onBroadcast(fn: (m: ServerToDashboard) => void): () => void;
  /** Fournit le `snapshot` envoyé à chaque client après son `hello`. */
  setSnapshot(fn: () => Snapshot): void;
  /** Port réellement lié (0 = éphémère dans les tests). */
  whenListening(): Promise<number>;
}

export interface HubOptions {
  host?: string;
  log?: Logger;
}

/** Types de messages acceptés du client sim, après son hello. */
const SIM_MESSAGE_TYPES: ReadonlySet<string> = new Set(['state', 'sim_event', 'action_result', 'views_result']);

export function createHub(port: number, opts: HubOptions = {}): Hub {
  const log = opts.log ?? silentLogger;
  const wss = new WebSocketServer({ port, host: opts.host ?? '127.0.0.1' });
  const listening = new Promise<number>((resolve, reject) => {
    wss.once('listening', () => {
      const a = wss.address();
      resolve(typeof a === 'object' && a !== null ? a.port : port);
    });
    wss.once('error', reject);
  });
  const roles = new Map<WebSocket, ClientRole>();
  let sim: WebSocket | null = null;
  const simListeners = new Set<(m: SimToServer) => void>();
  const broadcastListeners = new Set<(m: ServerToDashboard) => void>();
  let snapshot: () => Snapshot = () => ({ type: 'snapshot', state: createDefaultWorld(0), phase: 'idle', episodeId: null });

  const sendJson = (socket: WebSocket, m: ServerToSim | ServerToDashboard): boolean => {
    if (socket.readyState !== WebSocket.OPEN) return false;
    socket.send(JSON.stringify(m));
    return true;
  };

  const onHello = (socket: WebSocket, role: ClientRole): void => {
    roles.set(socket, role);
    if (role === 'sim') {
      if (sim !== null && sim !== socket) {
        log('hub: nouveau client sim, l\'ancien est remplacé');
        sim.close();
      }
      sim = socket;
    }
    sendJson(socket, snapshot());
  };

  wss.on('connection', (socket) => {
    socket.on('message', (data) => {
      const m = parseMessage(String(data));
      if (m === null) {
        log('hub: message illisible ignoré');
        return;
      }
      if (m.type === 'hello') {
        onHello(socket, m.role);
        return;
      }
      if (socket === sim && SIM_MESSAGE_TYPES.has(m.type)) {
        for (const fn of simListeners) fn(m as SimToServer);
        return;
      }
      log(`hub: message ${m.type} ignoré (rôle ${roles.get(socket) ?? 'inconnu'})`);
    });
    socket.on('close', () => {
      roles.delete(socket);
      if (sim === socket) sim = null;
    });
    socket.on('error', (e) => log(`hub: erreur socket (${e.message})`));
  });

  return {
    onSimMessage(fn) {
      simListeners.add(fn);
      return () => simListeners.delete(fn);
    },
    sendToSim: (m) => (sim !== null ? sendJson(sim, m) : false),
    broadcast(m) {
      for (const client of wss.clients) sendJson(client, m);
      for (const fn of broadcastListeners) fn(m);
    },
    simConnected: () => sim !== null && sim.readyState === WebSocket.OPEN,
    async close() {
      for (const client of wss.clients) client.terminate();
      await new Promise<void>((resolve) => wss.close(() => resolve()));
    },
    onBroadcast(fn) {
      broadcastListeners.add(fn);
      return () => broadcastListeners.delete(fn);
    },
    setSnapshot(fn) {
      snapshot = fn;
    },
    whenListening: () => listening,
  };
}
