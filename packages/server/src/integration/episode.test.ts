import { mkdtemp, readdir, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createDefaultWorld, type Tomato, type WorldState } from '@tomato/shared';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createEpisodeJournal, type EpisodeJournal, type EpisodeRecord } from '../episodes/journal';
import { createHub, type Hub } from '../hub/hub';
import { createMcpServer } from '../mcp/createMcpServer';
import { createSimBridge } from '../sim/simBridge';
import { createSession, type Session } from '../state/session';
import { connectInMemory, type TestMcpClient } from '../testing/mcpClient';
import { connectScriptedSim, type ScriptedSim } from './scriptedSim';

const tomato: Tomato = {
  id: 1, state: 'ripe', ripeness: 1, positionCm: [10, 0, 60], radiusCm: 3,
  stem: { fromCm: [10, 0, 66], toCm: [10, 0, 63] }, attached: true, visibleIn: { top: 1, front: 1, side: 1 },
};
const world: WorldState = { ...createDefaultWorld(1), tomatoes: [tomato] };

async function waitFor(cond: () => boolean, what: string, timeoutMs = 3000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (!cond()) {
    if (Date.now() > deadline) throw new Error(`timeout waiting for ${what}`);
    await new Promise((r) => setTimeout(r, 5));
  }
}

let dir: string;
let hub: Hub;
let journal: EpisodeJournal;
let session: Session;
let sim: ScriptedSim;
let mcp: TestMcpClient;

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'tomato-episode-'));
  hub = createHub(0);
  const bridge = createSimBridge(hub, { timeoutMs: 2000 });
  journal = createEpisodeJournal(dir);
  session = createSession(hub, { sim: bridge, journal });
  hub.onBroadcast((m) => journal.record(m));
  bridge.onEvent((e) => session.handleSimEvent(e));
  sim = await connectScriptedSim(await hub.whenListening(), world);
  await waitFor(() => bridge.latestState() !== null, 'first state');
  mcp = await connectInMemory(createMcpServer({ sim: bridge, session, hub }));
});

afterEach(async () => {
  await mcp.close();
  await sim.close();
  await hub.close();
  await rm(dir, { recursive: true, force: true });
});

/** Le script de la spec : get_views → move_basket → move_scissors ×3 → open_scissors → cut → report. */
async function runScript(basketX: number, basketY: number): Promise<{ cut: string; report: string }> {
  sim.emit({ type: 'ripe_detected', tomatoId: 1, detector: 'hsv', confidence: 0.95 });
  await waitFor(() => session.get().phase === 'detected', 'detected');

  const views = await mcp.call('get_views');
  expect(views.isError).toBe(false);
  expect(views.blocks.filter((b) => b.type === 'image')).toHaveLength(3);
  expect(views.blocks.at(-2)!.text).toContain('"targetTomatoId":1');
  expect(views.blocks.at(-1)!.text).toMatch(/^suggestedScissors for target stem #1 \(rotate_scissors, mode absolute, roll 0\): \{"yawDeg":/);

  expect((await mcp.call('move_basket', { x: basketX, y: basketY, mode: 'absolute' })).isError).toBe(false);
  expect(session.get().phase).toBe('harvesting');
  for (const z of [80, 70, 63]) expect((await mcp.call('move_scissors', { x: 10, y: 0, z, mode: 'absolute' })).isError).toBe(false);
  expect((await mcp.call('open_scissors')).isError).toBe(false);
  const cut = await mcp.call('cut');
  expect(cut.isError).toBe(false);
  expect(session.get().phase).toBe('falling');
  await waitFor(() => session.get().phase === 'harvested' || session.get().phase === 'missed', 'landing');
  const phase = session.get().phase;
  const report = await mcp.call('report', { outcome: phase === 'harvested' ? 'harvested' : 'missed', note: 'script' });
  expect(report.isError).toBe(false);
  return { cut: cut.blocks[0]!.text!, report: report.blocks[0]!.text! };
}

async function readJournal(): Promise<EpisodeRecord> {
  await journal.flush();
  const files = await readdir(dir);
  expect(files).toHaveLength(1);
  return JSON.parse(await readFile(join(dir, files[0]!), 'utf8')) as EpisodeRecord;
}

describe('end-to-end episode with a scripted sim', () => {
  it('harvests the tomato when the basket is under it, and writes the journal', async () => {
    const { cut, report } = await runScript(10, 0);
    expect(cut).toMatch(/^ok : stem_cut/);
    expect(report).toMatch(/clos : harvested/);
    expect(session.get()).toMatchObject({ phase: 'idle', harvested: 1, missed: 0, episodeId: null });

    const record = await readJournal();
    expect(record).toMatchObject({ tomatoId: 1, outcome: 'harvested', note: 'script', toolCalls: 8 });
    expect(record.episodeId).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}-\d{3}Z-t1$/);
    const types = record.messages.map((m) => m.message.type);
    expect(types.filter((t) => t === 'tool_call_start')).toHaveLength(8);
    expect(types.filter((t) => t === 'tool_call_result')).toHaveLength(8);
    expect(types).toContain('views');
    const phases = record.messages.flatMap((m) => (m.message.type === 'phase' ? [m.message.phase] : []));
    expect(phases).toEqual(['detected', 'harvesting', 'cutting', 'falling', 'harvested', 'idle']);
    const summaries = record.messages.flatMap((m) => (m.message.type === 'tool_call_result' ? [m.message.summary] : []));
    expect(summaries).toContain('ciseaux vers X 10, Y 0, Z 63');
    expect(summaries).toContain('coupe : stem_cut');
  });

  it('misses the tomato when the basket is elsewhere', async () => {
    const { report } = await runScript(-30, -30);
    expect(report).toMatch(/clos : missed/);
    expect(session.get()).toMatchObject({ phase: 'idle', harvested: 0, missed: 1 });
    expect((await readJournal()).outcome).toBe('missed');
  });

  it('reports a misaligned cut as text and keeps harvesting', async () => {
    sim.emit({ type: 'ripe_detected', tomatoId: 1, detector: 'yolo', confidence: 0.7 });
    await waitFor(() => session.get().phase === 'detected', 'detected');
    await mcp.call('move_scissors', { x: 10, y: 0, z: 70, mode: 'absolute' });
    const cut = await mcp.call('cut');
    expect(cut.isError).toBe(true);
    expect(cut.blocks[0]!.text).toBe('misaligned : cut point is off the stem (7 cm, 90°)');
    expect(session.get().phase).toBe('harvesting');
  });
});
