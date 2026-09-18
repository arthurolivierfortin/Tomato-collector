import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { ToolName } from '@tomato/shared';

export interface Block {
  type: string;
  text?: string;
  data?: string;
  mimeType?: string;
}

export interface TestMcpClient {
  client: Client;
  /** Appelle un outil et renvoie ses blocs de contenu et le drapeau isError. */
  call(tool: ToolName, args?: Record<string, unknown>): Promise<{ blocks: Block[]; isError: boolean }>;
  toolNames(): Promise<string[]>;
  close(): Promise<void>;
}

/** Blocs de contenu d'un résultat callTool (le type du SDK est une union avec un format de compatibilité). */
export function blocksOf(result: unknown): Block[] {
  if (typeof result === 'object' && result !== null && Array.isArray((result as { content?: unknown }).content)) {
    return (result as { content: Block[] }).content;
  }
  return [];
}

/** Client MCP relié en mémoire à `server` (InMemoryTransport.createLinkedPair). */
export async function connectInMemory(server: McpServer): Promise<TestMcpClient> {
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: 'test-client', version: '0.0.0' });
  await server.connect(serverTransport);
  await client.connect(clientTransport);
  return {
    client,
    async call(tool, args = {}) {
      const r = await client.callTool({ name: tool, arguments: args });
      return { blocks: blocksOf(r), isError: (r as { isError?: boolean }).isError === true };
    },
    async toolNames() {
      return (await client.listTools()).tools.map((t) => t.name);
    },
    async close() {
      await client.close();
      await server.close();
    },
  };
}
