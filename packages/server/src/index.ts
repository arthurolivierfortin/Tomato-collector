import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createDefaultWorld } from '@tomato/shared';
import { createNoopRunner, loadAgentRunner } from './agentRunner';
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

  const app = createApp({ createServer: () => createMcpServer({ sim, session, hub }, { log }), journal, session, hub, log });
  const wsPort = await hub.whenListening();
  const http = await new Promise<ReturnType<typeof app.listen>>((done) => {
    const s = app.listen(config.mcpPort, '127.0.0.1', () => done(s));
  });
  const mcpUrl = `http://localhost:${config.mcpPort}/mcp`;

  const systemPrompt = await readFile(SYSTEM_PROMPT_PATH, 'utf8').catch(() => '');
  const runner = config.agent === 'on'
    ? await loadAgentRunner({ hub, session, sim, mcpUrl, model: config.model, systemPrompt }, log)
    : createNoopRunner(log);
  session.onWake((e) => runner.wake(e));

  log(`prêt : MCP ${mcpUrl} · WebSocket ws://localhost:${wsPort} · épisodes ${config.episodesDir} · agent ${config.agent} (${config.model})`);

  const shutdown = (): void => {
    log('arrêt');
    runner.stop();
    http.close();
    void hub.close().then(() => process.exit(0));
  };
  process.once('SIGINT', shutdown);
  process.once('SIGTERM', shutdown);
}

void main().catch((e: unknown) => {
  console.error(e);
  process.exit(1);
});
