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
import { createLogSink } from './logSink';
import { logStreamLine, serverLine } from './logStream';
import { createSimBridge } from './sim/simBridge';
import { createSession } from './state/session';
import { VERSION } from './version';

/** Prompt système de l'agent (M6) ; vide tant que le fichier n'existe pas. */
const SYSTEM_PROMPT_PATH = resolve(import.meta.dirname, '../prompts/system.md');

async function main(): Promise<void> {
  const config = readConfig(process.env);
  // Le flux de la session, tel quel, sur stdout et dans un fichier que la page « terminal » du
  // pipeline vidéo suit (issue #35). Les lignes du serveur lui-même y vont aussi : la vidéo doit
  // montrer le démarrage et le réveil, pas seulement les appels d'outils.
  const sink = createLogSink(config.logStream === 'on' ? config.logFile : '');
  const log = (line: string): void => {
    consoleLogger(line);
    if (config.logStream === 'on') sink.write(serverLine(line));
  };
  log(`tomato-server ${VERSION} : démarrage`);

  const hub = createHub(config.wsPort, { log });
  const sim = createSimBridge(hub, { log });
  const journal = createEpisodeJournal(config.episodesDir, { log });
  const session = createSession(hub, { sim, journal, log });
  hub.setSnapshot(() => ({ type: 'snapshot', state: sim.latestState() ?? createDefaultWorld(0), phase: session.get().phase, episodeId: session.get().episodeId }));
  hub.onBroadcast((m) => journal.record(m));
  // Terminal de tournage (issue #35) : le flux de la session agent, tel quel, sur la sortie standard.
  if (config.logStream === 'on') {
    hub.onBroadcast((m) => {
      const line = logStreamLine(m);
      if (line === null) return;
      process.stdout.write(`${line}
`);
      sink.write(line);
    });
  }
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
    `prêt : MCP ${mcpUrl} · WebSocket ws://localhost:${wsPort} · ${wake} · épisodes ${config.episodesDir} · agent ${config.agent} (${config.model}) · rythme outils ${config.toolPacingMs} ms · flux console ${config.logStream}${config.logFile === '' ? '' : ` → ${config.logFile}`}`,
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
