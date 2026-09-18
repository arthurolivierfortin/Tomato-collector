import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import type { Transport } from '@modelcontextprotocol/sdk/shared/transport.js';
import { TOOL_NAMES, createDefaultWorld } from '@tomato/shared';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createMcpServer } from '../mcp/createMcpServer';
import { createSession } from '../state/session';
import { createFakeHub, createFakeSim, createMemoryJournal, type MemoryJournal } from '../testing/fakes';
import { blocksOf } from '../testing/mcpClient';
import { createApp } from './app';

let http: Server;
let base: string;
let journal: MemoryJournal;

beforeAll(async () => {
  const hub = createFakeHub();
  hub.connected = false;
  const sim = createFakeSim(createDefaultWorld(1));
  journal = createMemoryJournal();
  const session = createSession(hub, { sim, journal });
  const app = createApp({ createServer: () => createMcpServer({ sim, session, hub }), journal, session, hub });
  http = await new Promise<Server>((resolve) => {
    const s = app.listen(0, '127.0.0.1', () => resolve(s));
  });
  base = `http://127.0.0.1:${(http.address() as AddressInfo).port}`;
});

afterAll(async () => {
  await new Promise<void>((resolve) => http.close(() => resolve()));
});

describe('HTTP app', () => {
  it('serves MCP over streamable HTTP with the SDK client transport (the one Claude Code uses)', async () => {
    const client = new Client({ name: 'http-test', version: '0.0.0' });
    await client.connect(new StreamableHTTPClientTransport(new URL(`${base}/mcp`)) as Transport);
    expect((await client.listTools()).tools.map((t) => t.name)).toEqual([...TOOL_NAMES]);
    const r = await client.callTool({ name: 'get_status', arguments: {} });
    const blocks = blocksOf(r);
    expect(blocks[0]!.type).toBe('text');
    expect(JSON.parse(blocks[0]!.text!)).toMatchObject({ phase: 'idle', simConnected: false });
    const second = await client.callTool({ name: 'cut', arguments: {} });
    expect(blocksOf(second)[0]!.text).toMatch(/^ok : cut ok/);
    await client.close();
  });

  it('answers 405 to GET and DELETE on /mcp', async () => {
    const get = await fetch(`${base}/mcp`, { headers: { accept: 'text/event-stream' } });
    expect(get.status).toBe(405);
    const del = await fetch(`${base}/mcp`, { method: 'DELETE' });
    expect(del.status).toBe(405);
  });

  it('exposes /health, /episodes and /episodes/:id', async () => {
    const health = (await (await fetch(`${base}/health`)).json()) as Record<string, unknown>;
    expect(health).toMatchObject({ ok: true, phase: 'idle', simConnected: false, harvested: 0, missed: 0 });
    expect(await (await fetch(`${base}/episodes`)).json()).toEqual([]);
    journal.open('ep-x', 2);
    await journal.close('harvested', 'n', 3);
    expect(await (await fetch(`${base}/episodes`)).json()).toEqual([{ episodeId: 'ep-x', startedAt: new Date(0).toISOString(), outcome: 'harvested', tomatoId: 2 }]);
    expect(await (await fetch(`${base}/episodes/ep-x`)).json()).toMatchObject({ episodeId: 'ep-x', toolCalls: 3 });
    expect((await fetch(`${base}/episodes/nope`)).status).toBe(404);
  });

  // Issue #27 : la page Vite (autre origine) doit pouvoir lire ces routes depuis le navigateur.
  it('allows cross-origin GET on /health, /episodes and /episodes/:id, and answers OPTIONS preflights', async () => {
    for (const path of ['/health', '/episodes', '/episodes/ep-x']) {
      const res = await fetch(`${base}${path}`, { headers: { origin: 'http://localhost:5173' } });
      expect(res.headers.get('access-control-allow-origin'), path).toBe('*');
    }
    const preflight = await fetch(`${base}/episodes`, {
      method: 'OPTIONS',
      headers: { origin: 'http://localhost:5173', 'access-control-request-method': 'GET' },
    });
    expect(preflight.status).toBe(204);
    expect(preflight.headers.get('access-control-allow-origin')).toBe('*');
    expect(preflight.headers.get('access-control-allow-methods')).toMatch(/GET/);
    expect(preflight.headers.get('access-control-allow-methods')).toMatch(/OPTIONS/);
  });
});
