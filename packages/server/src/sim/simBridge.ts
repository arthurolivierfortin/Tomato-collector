import { randomUUID } from 'node:crypto';
import { createDefaultWorld, fail, type ActionResult, type CameraId, type SimAction, type SimEvent, type ViewsResult, type WorldState } from '@tomato/shared';
import type { Hub } from '../hub/hub';
import { silentLogger, type Logger } from '../log';
import { emptyViews } from './viewsFallback';

export interface SimBridge {
  apply(action: SimAction): Promise<ActionResult>;
  /** Sans réponse de la sim : `images` vide et JSON du dernier état connu. */
  renderViews(cameras: CameraId[]): Promise<ViewsResult>;
  latestState(): WorldState | null;
  onEvent(fn: (e: SimEvent) => void): () => void;
}

export interface SimBridgeOptions {
  timeoutMs?: number;
  log?: Logger;
  newId?: () => string;
}

export const SIM_TIMEOUT_MS = 15_000;
export const SIM_UNAVAILABLE = 'simulation did not answer';

type Pending =
  | { kind: 'action_result'; resolve: (r: ActionResult) => void; timer: ReturnType<typeof setTimeout> }
  | { kind: 'views_result'; resolve: (r: ViewsResult) => void; timer: ReturnType<typeof setTimeout> };

export function createSimBridge(hub: Hub, opts: SimBridgeOptions = {}): SimBridge {
  const timeoutMs = opts.timeoutMs ?? SIM_TIMEOUT_MS;
  const log = opts.log ?? silentLogger;
  const newId = opts.newId ?? randomUUID;
  const pending = new Map<string, Pending>();
  const eventListeners = new Set<(e: SimEvent) => void>();
  let latest: WorldState | null = null;

  const known = (): WorldState => latest ?? createDefaultWorld(0);

  hub.onSimMessage((m) => {
    switch (m.type) {
      case 'state':
        latest = m.state;
        return;
      case 'sim_event':
        for (const fn of eventListeners) fn(m.event);
        return;
      case 'action_result':
      case 'views_result': {
        const p = pending.get(m.requestId);
        if (!p) {
          log(`simBridge: réponse ${m.type} sans requête en attente (${m.requestId})`);
          return;
        }
        pending.delete(m.requestId);
        clearTimeout(p.timer);
        if (p.kind === 'action_result' && m.type === 'action_result') {
          latest = m.result.state;
          p.resolve(m.result);
        } else if (p.kind === 'views_result' && m.type === 'views_result') {
          p.resolve(m.result);
        } else {
          log(`simBridge: réponse ${m.type} inattendue pour une requête ${p.kind}`);
        }
        return;
      }
      case 'hello':
        return;
    }
  });

  function request<T>(kind: Pending['kind'], build: (requestId: string) => Parameters<Hub['sendToSim']>[0], onFail: () => T, wrap: (resolve: (r: T) => void, timer: ReturnType<typeof setTimeout>) => Pending): Promise<T> {
    if (!hub.simConnected()) return Promise.resolve(onFail());
    return new Promise<T>((resolve) => {
      const requestId = newId();
      const timer = setTimeout(() => {
        pending.delete(requestId);
        log(`simBridge: délai dépassé pour ${kind} (${requestId})`);
        resolve(onFail());
      }, timeoutMs);
      pending.set(requestId, wrap(resolve, timer));
      if (!hub.sendToSim(build(requestId))) {
        clearTimeout(timer);
        pending.delete(requestId);
        resolve(onFail());
      }
    });
  }

  return {
    apply: (action) =>
      request<ActionResult>(
        'action_result',
        (requestId) => ({ type: 'apply_action', requestId, action }),
        () => fail(known(), 'not_available', SIM_UNAVAILABLE),
        (resolve, timer) => ({ kind: 'action_result', resolve, timer }),
      ),
    renderViews: (cameras) =>
      request<ViewsResult>(
        'views_result',
        (requestId) => ({ type: 'render_views', requestId, cameras }),
        () => emptyViews(known()),
        (resolve, timer) => ({ kind: 'views_result', resolve, timer }),
      ),
    latestState: () => latest,
    onEvent(fn) {
      eventListeners.add(fn);
      return () => eventListeners.delete(fn);
    },
  };
}
