import { createWakeServer, readWakePort, resolveWakeEvent } from './agent/wakeServer';
import type { Hub } from './hub/hub';
import { silentLogger, type Logger } from './log';
import type { SimBridge } from './sim/simBridge';
import { detectionLabel, type Session, type WakeEvent } from './state/session';

/** Contrat du runner d'agent (implémenté par M6 dans `src/agent/`). */
export interface AgentRunner {
  wake(event: WakeEvent): void;
  busy(): boolean;
  /** Résolue quand l'épisode en cours est coupé (M6 attend brièvement le coût après un `report`). */
  stop(): Promise<void>;
}

export interface AgentRunnerDeps {
  hub: Hub;
  session: Session;
  mcpUrl: string;
  model: string;
  systemPrompt: string;
  /** Pont sim : résumé d'état joint au réveil et résolution des identifiants de `POST /wake/<id>` (M6). */
  sim?: SimBridge;
  /** Port de réveil laissé à M6 ; `-1` : le serveur de réveil est celui d'ici, dans les deux modes (issue #29). */
  wakePort?: number;
}

export type CreateAgentRunner = (deps: AgentRunnerDeps) => AgentRunner;

/** Module M6 attendu : `packages/server/src/agent/index.ts` exportant `createAgentRunner`. */
export const AGENT_MODULE: string = './agent/index.js';

/** De quoi mettre un réveil en scène sans agent : ouvrir l'épisode et l'annoncer au dashboard (issue #29). */
export interface NoopRunnerDeps {
  hub: Hub;
  session: Session;
}

/**
 * Runner inerte : TOMATO_AGENT=off ou M6 absent (pilotage à la main depuis Claude Code).
 * Avec `deps`, un réveil (détection ou `POST /wake/<id>`) joue la mise en scène de la détection —
 * bloc perception → serveur, épisode ouvert et journalisé, phase `detected`, bloc serveur → agent,
 * `agent_wake` — et s'arrête là : aucune requête au SDK n'est lancée.
 */
export function createNoopRunner(log: Logger = silentLogger, deps?: NoopRunnerDeps): AgentRunner {
  // `startEpisode` prévient ses abonnés `onWake`, branchés sur ce runner par `index.ts` : une seule mise en scène.
  let staging = false;

  function stage(d: NoopRunnerDeps, event: WakeEvent): void {
    const open = d.session.get();
    if (open.episodeId !== null && open.targetTomatoId !== event.tomatoId) {
      log(`agent: désactivé, réveil de la tomate ${event.tomatoId} ignoré (épisode en cours pour la tomate ${String(open.targetTomatoId)})`);
      return;
    }
    if (open.episodeId === null) {
      d.hub.broadcast({ type: 'block_activity', from: 'perception', to: 'server', label: detectionLabel(event.tomatoId, event) });
      d.session.startEpisode(event.tomatoId, event);
    }
    const episodeId = d.session.get().episodeId ?? 'manual';
    d.hub.broadcast({
      type: 'agent_wake',
      episodeId,
      tomatoId: event.tomatoId,
      detector: event.detector,
      confidence: event.confidence,
      sessionResumed: false,
    });
    log(`agent: désactivé, réveil mis en scène (tomate ${event.tomatoId}, épisode ${episodeId}) ; aucune requête au SDK`);
  }

  return {
    wake(event) {
      if (deps === undefined) {
        log(`agent: désactivé, réveil ignoré (tomate ${event.tomatoId})`);
        return;
      }
      if (staging) return;
      staging = true;
      try {
        stage(deps, event);
      } finally {
        staging = false;
      }
    },
    busy: () => false,
    stop: () => Promise.resolve(),
  };
}

function hasFactory(mod: unknown): mod is { createAgentRunner: CreateAgentRunner } {
  return typeof mod === 'object' && mod !== null && typeof (mod as { createAgentRunner?: unknown }).createAgentRunner === 'function';
}

/** Charge le runner M6 s'il existe ; sinon journalise et renvoie le runner inerte. */
export async function loadAgentRunner(deps: AgentRunnerDeps, log: Logger = silentLogger, specifier: string = AGENT_MODULE): Promise<AgentRunner> {
  let mod: unknown;
  try {
    mod = await import(specifier);
  } catch (e) {
    log(`agent: module ${specifier} absent (${String(e)}), runner désactivé`);
    return createNoopRunner(log);
  }
  if (!hasFactory(mod)) {
    log(`agent: ${specifier} n'exporte pas createAgentRunner, runner désactivé`);
    return createNoopRunner(log);
  }
  return mod.createAgentRunner(deps);
}

export interface RunnerOptions {
  agent: 'on' | 'off';
  /** Défaut : `TOMATO_WAKE_PORT` (7333) ; 0 = port libre (tests) ; négatif = pas de serveur. */
  wakePort?: number;
  log?: Logger;
  /** Module d'agent à charger (les tests en passent un factice). */
  module?: string;
}

export interface RunnerHandle {
  runner: AgentRunner;
  /** Port du serveur de réveil manuel, null s'il n'a pas pu démarrer. */
  wakePort: number | null;
  /** Arrête le runner puis ferme le serveur de réveil. */
  stop(): Promise<void>;
}

/**
 * Branchement de `index.ts` : le runner du mode demandé et le serveur de réveil manuel, qui écoute
 * dans les deux modes (issue #29). M6 reçoit `wakePort: -1` pour ne pas ouvrir un second serveur.
 */
export async function startRunner(deps: AgentRunnerDeps, opts: RunnerOptions): Promise<RunnerHandle> {
  const log = opts.log ?? silentLogger;
  const sim = deps.sim;
  const runner =
    opts.agent === 'on'
      ? await loadAgentRunner({ ...deps, wakePort: -1 }, log, opts.module ?? AGENT_MODULE)
      : createNoopRunner(log, { hub: deps.hub, session: deps.session });
  const port = opts.wakePort ?? readWakePort();
  const wake =
    port < 0
      ? null
      : await createWakeServer({
          port,
          agent: opts.agent,
          runner,
          resolve: (id) => (sim === undefined ? null : resolveWakeEvent(sim, id)),
          knownIds: () => (sim?.latestState()?.tomatoes ?? []).map((t) => t.id),
        }).catch((e: unknown) => {
          log(`agent: serveur de réveil indisponible sur le port ${port} (${String(e)})`);
          return null;
        });
  return {
    runner,
    wakePort: wake?.port ?? null,
    stop: async () => {
      const drained = runner.stop();
      await wake?.close();
      await drained;
    },
  };
}
