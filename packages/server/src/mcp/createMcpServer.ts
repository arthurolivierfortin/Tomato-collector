import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { TOOL_DESCRIPTIONS, TOOL_NAMES, ToolSchemas } from '@tomato/shared';
import { VERSION } from '../version';
import type { ToolDeps } from './handlers';
import { createToolRunner, type ToolRunnerOptions } from './toolRunner';

export const MCP_SERVER_NAME = 'tomato-robot';

/**
 * Serveur MCP « tomato-robot » : les neuf outils de `ToolSchemas` / `TOOL_DESCRIPTIONS`.
 * Une instance par requête HTTP (mode sans session du transport streamable HTTP) ou par client en mémoire (tests).
 */
export function createMcpServer(deps: ToolDeps, opts: ToolRunnerOptions = {}): McpServer {
  const run = createToolRunner(deps, opts);
  const server = new McpServer({ name: MCP_SERVER_NAME, version: VERSION });
  for (const name of TOOL_NAMES) {
    server.registerTool(name, { description: TOOL_DESCRIPTIONS[name], inputSchema: ToolSchemas[name] }, async (args: unknown) => {
      const outcome = await run(name, args);
      return { content: outcome.content, isError: !outcome.ok };
    });
  }
  return server;
}
