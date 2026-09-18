import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import type { Transport } from '@modelcontextprotocol/sdk/shared/transport.js';
import express, { type Express, type Request, type Response } from 'express';
import type { EpisodeJournal } from '../episodes/journal';
import type { Hub } from '../hub/hub';
import { silentLogger, type Logger } from '../log';
import type { Session } from '../state/session';
import { VERSION } from '../version';

export interface AppDeps {
  /** Une instance de serveur MCP par requête (mode sans session). */
  createServer: () => McpServer;
  journal: EpisodeJournal;
  session: Session;
  hub: Hub;
  log?: Logger;
}

const JSON_BODY_LIMIT = '1mb';

function methodNotAllowed(_req: Request, res: Response): void {
  res.status(405).json({ jsonrpc: '2.0', error: { code: -32000, message: 'Method not allowed.' }, id: null });
}

/**
 * Express : `POST /mcp` (streamable HTTP sans session : transport + serveur neufs par requête, fermés à la fin
 * de la réponse), `GET`/`DELETE /mcp` → 405 (pas de flux SSE autonome, pas de session à terminer),
 * `GET /health`, `GET /episodes`, `GET /episodes/:id`.
 */
export function createApp(deps: AppDeps): Express {
  const log = deps.log ?? silentLogger;
  const app = express();
  app.use(express.json({ limit: JSON_BODY_LIMIT }));

  app.post('/mcp', async (req: Request, res: Response) => {
    const server = deps.createServer();
    const transport = new StreamableHTTPServerTransport({});
    res.on('close', () => {
      void transport.close();
      void server.close();
    });
    try {
      // Cast : le SDK déclare `onclose: (() => void) | undefined` sur la classe et `onclose?: () => void`
      // sur l'interface Transport, ce que `exactOptionalPropertyTypes` refuse (vérifié sur sdk 1.30.0).
      await server.connect(transport as Transport);
      await transport.handleRequest(req, res, req.body);
    } catch (e) {
      log(`mcp: requête en échec (${String(e)})`);
      if (!res.headersSent) res.status(500).json({ jsonrpc: '2.0', error: { code: -32603, message: 'Internal server error' }, id: null });
    }
  });
  app.get('/mcp', methodNotAllowed);
  app.delete('/mcp', methodNotAllowed);

  app.get('/health', (_req: Request, res: Response) => {
    const s = deps.session.get();
    res.json({ ok: true, version: VERSION, phase: s.phase, episodeId: s.episodeId, simConnected: deps.hub.simConnected(), harvested: s.harvested, missed: s.missed });
  });

  app.get('/episodes', async (_req: Request, res: Response) => {
    res.json(await deps.journal.list());
  });

  app.get('/episodes/:id', async (req: Request<{ id: string }>, res: Response) => {
    const record = await deps.journal.read(req.params.id);
    if (record === null) {
      res.status(404).json({ error: 'episode not found' });
      return;
    }
    res.json(record);
  });

  return app;
}
