import { MAX_TOOL_CALLS_PER_EPISODE, TOOL_NAMES, createDefaultWorld } from '@tomato/shared';
import { afterEach, describe, expect, it } from 'vitest';
import { createSession } from '../state/session';
import { createFakeHub, createFakeSim, createMemoryJournal } from '../testing/fakes';
import { connectInMemory, type TestMcpClient } from '../testing/mcpClient';
import { createMcpServer } from './createMcpServer';
import { LIMIT_TEXT } from './toolRunner';

let open: TestMcpClient | null = null;

afterEach(async () => {
  await open?.close();
  open = null;
});

async function setup() {
  const hub = createFakeHub();
  const sim = createFakeSim(createDefaultWorld(1));
  const session = createSession(hub, { sim, journal: createMemoryJournal() });
  let clock = 1000;
  let n = 0;
  const server = createMcpServer({ sim, session, hub }, { now: () => (clock += 7), newId: () => `call-${++n}` });
  open = await connectInMemory(server);
  return { hub, sim, session, mcp: open };
}

describe('MCP server over the in-memory transport', () => {
  it('lists the nine tools with their descriptions and strict input schemas', async () => {
    const { mcp } = await setup();
    expect(await mcp.toolNames()).toEqual([...TOOL_NAMES]);
    const tools = (await mcp.client.listTools()).tools;
    const move = tools.find((t) => t.name === 'move_scissors')!;
    expect(move.description).toMatch(/^Move the scissors cut point/);
    expect(move.inputSchema).toMatchObject({ type: 'object', required: ['x', 'y', 'z', 'mode'] });
  });

  it('returns text and image content blocks and broadcasts tool_call_start / tool_call_result', async () => {
    const { mcp, hub } = await setup();
    const status = await mcp.call('get_status');
    expect(status.isError).toBe(false);
    expect(status.blocks[0]!.type).toBe('text');
    expect(JSON.parse(status.blocks[0]!.text!)).toMatchObject({ phase: 'idle', episodeId: null });
    expect(hub.broadcasts.filter((m) => m.type === 'tool_call_start')).toEqual([
      { type: 'tool_call_start', episodeId: 'manual', callId: 'call-1', tool: 'get_status', args: {} },
    ]);
    expect(hub.broadcasts.filter((m) => m.type === 'tool_call_result')).toEqual([
      { type: 'tool_call_result', episodeId: 'manual', callId: 'call-1', ok: true, summary: 'état : idle, 0 tomates', durationMs: 7 },
    ]);
    const blocks = hub.broadcasts.filter((m) => m.type === 'block_activity');
    expect(blocks.map((b) => (b.type === 'block_activity' ? `${b.from}>${b.to}` : ''))).toEqual(['agent>server', 'server>agent']);

    const views = await mcp.call('get_views', { cameras: ['top'] });
    expect(views.isError).toBe(true);
    expect(views.blocks[0]!.text).toMatch(/^not_available : /);
  });

  it('serves a real image block for get_views when the sim answers', async () => {
    const { mcp, sim } = await setup();
    sim.views = (cams) => ({ images: cams.map((camera) => ({ camera, pngBase64: 'aGVsbG8=', widthPx: 800, heightPx: 800 })), json: { ...sim.state, tomatoes: [] } });
    const r = await mcp.call('get_views', { cameras: ['front'] });
    expect(r.isError).toBe(false);
    expect(r.blocks.map((b) => b.type)).toEqual(['text', 'image', 'text']);
    expect(r.blocks[1]).toEqual({ type: 'image', data: 'aGVsbG8=', mimeType: 'image/png' });
  });

  it('refuses every tool but report beyond MAX_TOOL_CALLS_PER_EPISODE, and report closes the episode', async () => {
    const { mcp, session } = await setup();
    session.handleSimEvent({ type: 'ripe_detected', tomatoId: 1, detector: 'hsv', confidence: 1 });
    for (let i = 0; i < MAX_TOOL_CALLS_PER_EPISODE; i++) {
      expect((await mcp.call('open_scissors')).isError).toBe(false);
    }
    expect(session.get().toolCallsThisEpisode).toBe(MAX_TOOL_CALLS_PER_EPISODE);
    const over = await mcp.call('move_basket', { x: 0, y: 0, mode: 'absolute' });
    expect(over.isError).toBe(true);
    expect(over.blocks[0]!.text).toBe(LIMIT_TEXT);
    const report = await mcp.call('report', { outcome: 'aborted', note: 'limite' });
    expect(report.isError).toBe(false);
    expect(report.blocks[0]!.text).toMatch(/clos : aborted/);
    expect(session.get()).toMatchObject({ phase: 'idle', episodeId: null, toolCallsThisEpisode: 0 });
  });

  it('malformed arguments are refused by the SDK before the handler and reach the agent as an error text', async () => {
    const { mcp, hub } = await setup();
    const r = await mcp.call('move_scissors', { x: 1 });
    expect(r.isError).toBe(true);
    expect(r.blocks[0]!.text).toMatch(/Input validation error: Invalid arguments for tool move_scissors/);
    expect(hub.broadcasts.filter((m) => m.type === 'tool_call_start')).toEqual([]);
  });
});
