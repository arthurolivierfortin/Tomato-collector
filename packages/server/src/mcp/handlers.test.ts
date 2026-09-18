import { createDefaultWorld, fail, ok, type Tomato } from '@tomato/shared';
import { describe, expect, it } from 'vitest';
import { createSession } from '../state/session';
import { createFakeHub, createFakeSim, createMemoryJournal } from '../testing/fakes';
import { FALLING_TEXT, NO_IMAGES_TEXT, createToolHandlers } from './handlers';

const tomato: Tomato = {
  id: 1, state: 'ripe', ripeness: 1, positionCm: [10, 0, 60], radiusCm: 3,
  stem: { fromCm: [10, 0, 66], toCm: [10, 0, 63] }, attached: true, visibleIn: { top: 1, front: 1, side: 1 },
};
const PNG = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';

function setup() {
  const hub = createFakeHub();
  const sim = createFakeSim({ ...createDefaultWorld(1), tomatoes: [tomato] }, (s, a) => {
    if (a.type === 'move_scissors' && a.z > 100) return fail(s, 'out_of_reach', 'beyond arm reach', { requestedCm: a.z, maxCm: 100 });
    if (a.type === 'cut') return fail(s, 'misaligned', 'blade line is off the stem', { distanceCm: 1.42, angleDeg: 62 });
    if (a.type === 'move_scissors') return ok({ ...s, scissors: { ...s.scissors, cutPointCm: [a.x, a.y, a.z] } }, 'moved');
    return ok(s, `${a.type} ok`);
  });
  const journal = createMemoryJournal();
  const session = createSession(hub, { sim, journal });
  return { hub, sim, session, journal, handlers: createToolHandlers({ sim, session, hub }) };
}

describe('tool handlers', () => {
  it('turn invalid arguments into an invalid_argument text, never an exception', async () => {
    const { handlers } = setup();
    const r = await handlers.move_scissors({ x: 1, y: 2 });
    expect(r.ok).toBe(false);
    expect(r.content[0]).toMatchObject({ type: 'text' });
    expect((r.content[0] as { text: string }).text).toMatch(/^invalid_argument : /);
    expect((r.content[0] as { text: string }).text).toContain('mode');
    expect(r.summary).toBe('move_scissors : invalid_argument');
    const r2 = await handlers.get_views({ cameras: ['back'] });
    expect(r2.ok).toBe(false);
    expect((r2.content[0] as { text: string }).text).toContain('cameras.0');
  });

  it('get_status returns a compact JSON with the session phase, tomatoes, poses and limits', async () => {
    const { handlers, session } = setup();
    session.handleSimEvent({ type: 'ripe_detected', tomatoId: 1, detector: 'hsv', confidence: 1 });
    const r = await handlers.get_status({});
    const status = JSON.parse((r.content[0] as { text: string }).text) as Record<string, unknown>;
    expect(status).toMatchObject({ phase: 'detected', targetTomatoId: 1, simConnected: true, toolCalls: { used: 0, max: 40 } });
    expect(status.tomatoes).toEqual([{ id: 1, state: 'ripe', ripeness: 1, positionCm: [10, 0, 60], attached: true, stem: tomato.stem }]);
    expect(status).toHaveProperty('limits.scissorsReachCm', 110);
    expect(r.summary).toBe('état : detected, 1 tomates');
  });

  it('get_views returns header + image per camera then the JSON, and broadcasts views', async () => {
    const { handlers, sim, hub } = setup();
    sim.views = (cams) => ({ images: cams.map((camera) => ({ camera, pngBase64: PNG, widthPx: 800, heightPx: 800 })), json: { ...sim.state, tomatoes: [] } });
    const r = await handlers.get_views({ cameras: ['front', 'top'] });
    expect(r.ok).toBe(true);
    expect(r.content.map((b) => b.type)).toEqual(['text', 'image', 'text', 'image', 'text']);
    expect(r.content[0]).toEqual({ type: 'text', text: 'Vue front — axes X→ Z↑ — 8 px/cm' });
    expect(r.content[1]).toEqual({ type: 'image', data: PNG, mimeType: 'image/png' });
    const json = JSON.parse((r.content[4] as { text: string }).text) as { cameras: Record<string, unknown>; phase: string };
    expect(Object.keys(json.cameras)).toEqual(['top', 'front', 'side']);
    expect(hub.broadcasts.find((m) => m.type === 'views')).toMatchObject({ type: 'views', episodeId: null });
    expect(r.summary).toBe('vues : front, top');

    sim.views = null;
    const r2 = await handlers.get_views({});
    expect(r2.ok).toBe(false);
    expect((r2.content[0] as { text: string }).text).toBe(NO_IMAGES_TEXT);
  });

  it('movement tools return ActionResult texts with the resulting pose, or the structured error', async () => {
    const { handlers, sim } = setup();
    const okMove = await handlers.move_scissors({ x: 12, y: 4, z: 38, mode: 'absolute' });
    expect(okMove.ok).toBe(true);
    expect((okMove.content[0] as { text: string }).text).toMatch(/^ok : moved\n\{"cutPointCm":\[12,4,38\]/);
    expect(okMove.summary).toBe('ciseaux vers X 12, Y 4, Z 38');
    expect(sim.applied.at(-1)).toEqual({ type: 'move_scissors', x: 12, y: 4, z: 38, mode: 'absolute' });

    const far = await handlers.move_scissors({ x: 0, y: 0, z: 150, mode: 'absolute' });
    expect(far.ok).toBe(false);
    expect((far.content[0] as { text: string }).text).toBe('out_of_reach : beyond arm reach (150 cm, 100 cm)');

    const cut = await handlers.cut({});
    expect(cut.ok).toBe(false);
    expect(cut.summary).toBe('coupe : misaligned, 1,4 cm, 62°');

    await handlers.rotate_scissors({ yaw: 10, mode: 'relative' });
    expect(sim.applied.at(-1)).toEqual({ type: 'rotate_scissors', yaw: 10, mode: 'relative' });
    const basket = await handlers.move_basket({ x: 3, y: -2, mode: 'absolute' });
    expect(basket.summary).toBe('panier à X 0, Y 0');
  });

  it('move_camera applies the action and appends the refreshed view of that camera', async () => {
    const { handlers, sim } = setup();
    sim.views = (cams) => ({ images: cams.map((camera) => ({ camera, pngBase64: PNG, widthPx: 800, heightPx: 800 })), json: { ...sim.state, tomatoes: [] } });
    const r = await handlers.move_camera({ camera: 'side', dz: 5, zoom: 2 });
    expect(sim.applied.at(-1)).toEqual({ type: 'move_camera', camera: 'side', dz: 5, zoom: 2 });
    expect(r.content.map((b) => b.type)).toEqual(['text', 'text', 'image']);
    expect(r.summary).toMatch(/^caméra side à /);
  });

  it('appends the suggested blade angles of the target stem to get_views and move_camera', async () => {
    const { handlers, session, sim } = setup();
    session.handleSimEvent({ type: 'ripe_detected', tomatoId: 1, detector: 'hsv', confidence: 1 });
    const tilted: Tomato = { ...tomato, stem: { fromCm: [10, 0, 66], toCm: [7, 0, 63] } };
    sim.views = (cams) => ({ images: cams.map((camera) => ({ camera, pngBase64: PNG, widthPx: 800, heightPx: 800 })), json: { ...sim.state, targetTomatoId: 1, tomatoes: [tilted] } });
    const suggestion = { type: 'text', text: 'suggestedScissors for target stem #1 (rotate_scissors, mode absolute, roll 0): {"yawDeg":0,"pitchDeg":45}' };

    const views = await handlers.get_views({ cameras: ['top'] });
    expect(views.content.map((b) => b.type)).toEqual(['text', 'image', 'text', 'text']);
    expect(views.content.at(-1)).toEqual(suggestion);

    const cam = await handlers.move_camera({ camera: 'side', zoom: 2 });
    expect(cam.content.at(-1)).toEqual(suggestion);

    // Page sim rechargée en cours d'épisode : la sim ne connaît plus la cible, la session si.
    sim.views = (cams) => ({ images: cams.map((camera) => ({ camera, pngBase64: PNG, widthPx: 800, heightPx: 800 })), json: { ...sim.state, targetTomatoId: null, tomatoes: [tilted] } });
    const reloaded = await handlers.get_views({ cameras: ['top'] });
    expect(reloaded.content.at(-1)).toEqual(suggestion);
    const json = JSON.parse((reloaded.content[2] as { text: string }).text) as { targetTomatoId: number | null };
    expect(json.targetTomatoId).toBe(1);
  });

  it('says nothing about the blade angles outside an episode', async () => {
    const { handlers, sim } = setup();
    const tilted: Tomato = { ...tomato, stem: { fromCm: [10, 0, 66], toCm: [7, 0, 63] } };
    sim.views = (cams) => ({ images: cams.map((camera) => ({ camera, pngBase64: PNG, widthPx: 800, heightPx: 800 })), json: { ...sim.state, targetTomatoId: null, tomatoes: [tilted] } });
    const r = await handlers.get_views({ cameras: ['top'] });
    expect(r.content.map((b) => b.type)).toEqual(['text', 'image', 'text']);
  });

  it('report closes the episode with the real outcome, refuses during falling, is harmless in manual mode', async () => {
    const { handlers, session, journal } = setup();
    const manual = await handlers.report({ outcome: 'aborted', note: 'rien' });
    expect(manual.ok).toBe(true);
    expect(manual.summary).toBe('rapport : aucun épisode');

    session.handleSimEvent({ type: 'ripe_detected', tomatoId: 1, detector: 'hsv', confidence: 1 });
    session.noteToolResult('cut', true);
    const falling = await handlers.report({ outcome: 'harvested', note: 'trop tôt' });
    expect(falling.ok).toBe(false);
    expect((falling.content[0] as { text: string }).text).toBe(FALLING_TEXT);
    session.handleSimEvent({ type: 'tomato_landed', tomatoId: 1, inBasket: false });
    const done = await handlers.report({ outcome: 'harvested', note: 'je pense' });
    expect(done.ok).toBe(true);
    expect((done.content[0] as { text: string }).text).toMatch(/clos : missed \(déclaré harvested\) ; total 0 récoltée\(s\), 1 ratée\(s\)$/);
    expect(session.get().phase).toBe('missed');
    done.after?.();
    expect(session.get().phase).toBe('idle');
    expect(journal.records[0]).toMatchObject({ outcome: 'missed' });
  });
});
