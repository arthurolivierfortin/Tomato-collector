import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createDefaultWorld } from '@tomato/shared';
import { startRunner } from './agentRunner';
import { readConfig } from './config';
import { createEpisodeJournal } from './episodes/journal';
import { createHub } from './hub/hub';
import { createApp } from './http/app';
import { consoleLogger } from './log';
import { createMcpServer } from './mcp/createMcpServer';
import { createSimBridge } from './sim/simBridge';
import { createSession } from './state/session';
import { VERSION } from './version';

/** Prompt système de l'agent (M6) ; vide tant que le fichier n'existe pas. */
const SYSTEM_PROMPT_PATH = resolve(import.meta.dirname, '../prompts/system.md');

async function main(): Promise<void> {
  const log = consoleLogger;
  const config = readConfig(process.env);
  log(`tomato-server ${VERSION} : démarrage`);

  const hub = createHub(config.wsPort, { log });
  const sim = createSimBridge(hub, { log });
  const journal = createEpisodeJournal(config.episodesDir, { log });
  const session = createSession(hub, { sim, journal, log });
  hub.setSnapshot(() => ({ type: 'snapshot', state: sim.latestState() ?? createDefaultWorld(0), phase: session.get().phase, episodeId: session.get().episodeId }));
  hub.onBroadcast((m) => journal.record(m));
  sim.onEvent((e) => session.handleSimEvent(e));

  const app = createApp({
    createServer: () => createMcpServer({ sim, session, hub }, { log, pacingMs: config.toolPacingMs }),
    journal,
    session,
    hub,
    log,
  });
  const wsPort = await hub.whenListening();
  const http = await new Promise<ReturnType<typeof app.listen>>((done) => {
    const s = app.listen(config.mcpPort, '127.0.0.1', () => done(s));
  });
  const mcpUrl = `http://localhost:${config.mcpPort}/mcp`;

  const systemPrompt = await readFile(SYSTEM_PROMPT_PATH, 'utf8').catch(() => '');
  // Le serveur de réveil manuel écoute dans les deux modes ; agent off, le réveil est mis en scène sans SDK (issue #29).
  const { runner, wakePort, stop } = await startRunner(
    { hub, session, sim, mcpUrl, model: config.model, systemPrompt },
    { agent: config.agent, log },
  );
  session.onWake((e) => runner.wake(e));

  const wake = wakePort === null ? 'réveil manuel indisponible' : `réveil manuel http://127.0.0.1:${wakePort}/wake/<tomatoId>`;
  log(
    `prêt : MCP ${mcpUrl} · WebSocket ws://localhost:${wsPort} · ${wake} · épisodes ${config.episodesDir} · agent ${config.agent} (${config.model}) · rythme outils ${config.toolPacingMs} ms`,
  );

  const shutdown = (): void => {
    log('arrêt');
    http.close();
    void Promise.all([stop(), hub.close()]).then(() => process.exit(0));
  };
  process.once('SIGINT', shutdown);
  process.once('SIGTERM', shutdown);
}

void main().catch((e: unknown) => {
  console.error(e);
  process.exit(1);
});
