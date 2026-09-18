import { createServer } from 'node:http';
import type { IncomingMessage, Server, ServerResponse } from 'node:http';
import type { AgentRunner, AgentSim, WakeEvent } from './types';

export const DEFAULT_WAKE_PORT = 7333;

/** Port du serveur de réveil manuel : `TOMATO_WAKE_PORT`, sinon 7333 (valeur invalide comprise). */
export function readWakePort(env: NodeJS.ProcessEnv = process.env): number {
  const port = Number(env.TOMATO_WAKE_PORT ?? DEFAULT_WAKE_PORT);
  return Number.isInteger(port) ? port : DEFAULT_WAKE_PORT;
}

/**
 * Événement de réveil pour une tomate connue de la sim, null sinon.
 * Reconstruit hors détection (réveil manuel, épisode ouvert par M5) : détecteur `manual` (issue #23).
 */
export function resolveWakeEvent(sim: AgentSim, tomatoId: number): WakeEvent | null {
  const tomato = sim.latestState()?.tomatoes.find((t) => t.id === tomatoId);
  return tomato === undefined
    ? null
    : { tomatoId, positionCm: tomato.positionCm, detector: 'manual', confidence: 1 };
}

export interface WakeServerOptions {
  /** 0 = port libre (tests). */
  port: number;
  /** Le serveur écoute dans les deux modes ; `off` répond « mis en scène » au lieu de « mis en file » (issue #29). */
  agent?: 'on' | 'off';
  /** Le runner du mode courant : le runner M6 quand l'agent est actif, le runner factice sinon. */
  runner: Pick<AgentRunner, 'wake' | 'busy'>;
  /** Résout la tomate demandée depuis l'état de la sim ; null si inconnue. */
  resolve: (tomatoId: number) => WakeEvent | null;
  /** Identifiants connus, renvoyés dans l'erreur 404. */
  knownIds: () => number[];
}

export interface WakeServer {
  port: number;
  close(): Promise<void>;
}

function send(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { 'content-type': 'application/json' });
  res.end(JSON.stringify(body));
}

/** Route `POST /wake/<tomatoId>` et `GET /wake` (état). */
export function handleWakeRequest(opts: WakeServerOptions, req: IncomingMessage, res: ServerResponse): void {
  const url = req.url ?? '/';
  if (req.method === 'GET' && url === '/wake') {
    send(res, 200, { busy: opts.runner.busy(), tomatoes: opts.knownIds() });
    return;
  }
  const match = /^\/wake\/(\d+)$/.exec(url);
  if (req.method !== 'POST' || match === null) {
    send(res, 404, { error: 'not_found', usage: 'POST /wake/<tomatoId> or GET /wake' });
    return;
  }
  const tomatoId = Number(match[1]);
  const event = opts.resolve(tomatoId);
  if (event === null) {
    send(res, 404, { error: 'unknown_tomato', tomatoId, known: opts.knownIds() });
    return;
  }
  const wasBusy = opts.runner.busy();
  opts.runner.wake(event);
  // Agent off : le runner factice a mis le réveil en scène (épisode, `agent_wake`), sans rien demander au SDK.
  if (opts.agent === 'off') send(res, 202, { ok: true, agent: 'off', tomatoId });
  else send(res, 202, { queued: true, agent: 'on', tomatoId, behindRunningEpisode: wasBusy });
}

/** Petit serveur HTTP de réveil manuel (`npm run wake -- <tomatoId>`), indépendant d'Express (M5). */
export function createWakeServer(opts: WakeServerOptions): Promise<WakeServer> {
  const server: Server = createServer((req, res) => handleWakeRequest(opts, req, res));
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(opts.port, '127.0.0.1', () => {
      const address = server.address();
      const port = typeof address === 'object' && address !== null ? address.port : opts.port;
      resolve({
        port,
        close: () => new Promise<void>((done) => server.close(() => done())),
      });
    });
  });
}
