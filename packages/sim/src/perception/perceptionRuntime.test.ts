import { describe, expect, it } from 'vitest';
import { createDefaultWorld, type SimEvent, type Tomato, type TomatoState, type Vec3 } from '@tomato/shared';
import type { EdgeFilter } from '../cameras/edges';
import { testTomato } from '../cameras/testTomato';
import type { SimContext } from '../core/module';
import { createSignals } from '../core/signals';
import { createWorldStore } from '../core/store';
import { createPerceptionModule, frontProjector, type PerceptionDeps } from './perceptionRuntime';
import { makeRgba } from './rgba';
import { DETECTOR_INPUT_PX, type Detection, type RipeDetector } from './types';

const TOMATO_POS: Vec3 = [10, 0, 50];

function makeCtx(tomatoes: Tomato[]): { ctx: SimContext; events: SimEvent[] } {
  const events: SimEvent[] = [];
  const ctx: SimContext = {
    store: createWorldStore({ ...createDefaultWorld(1), tomatoes }),
    signals: createSignals(),
    emitEvent: (e) => events.push(e),
    scene: null,
    registry: { plantSpec: null },
  };
  return { ctx, events };
}

/** Boîte de 40 px centrée sur la projection d'une position monde dans l'image du détecteur. */
function boxAt(pos: Vec3, widthPx: number, score: number): Detection {
  const [px, py] = frontProjector(createDefaultWorld(1), widthPx)(pos);
  return { bbox: [px - 20, py - 20, 40, 40], score, label: 'ripe' };
}

/** Détecteur qui renvoie une boîte de 40 px centrée sur la projection de TOMATO_POS. */
function detectorAt(score: number, calls: number[] = []): RipeDetector {
  return (img) => {
    calls.push(img.width);
    return [boxAt(TOMATO_POS, img.width, score)];
  };
}

const noEdges = async (): Promise<EdgeFilter | null> => null;

function deps(over: Partial<PerceptionDeps>, state: TomatoState = 'ripe'): { deps: PerceptionDeps; ctx: SimContext; events: SimEvent[] } {
  const { ctx, events } = makeCtx([testTomato(1, TOMATO_POS, state)]);
  const d: PerceptionDeps = {
    captureFront: () => makeRgba(DETECTOR_INPUT_PX, DETECTOR_INPUT_PX),
    hsv: detectorAt(0.8),
    loadYolo: async () => null,
    loadEdgeFilter: noEdges,
    setEdgeFilter: () => undefined,
    options: { consecutiveFrames: 3, periodS: 0.5 },
    ...over,
  };
  return { deps: d, ctx, events };
}

/** Avance le temps sim par pas de 0,25 s et attend chaque tick asynchrone. */
async function run(mod: ReturnType<typeof createPerceptionModule>, ctx: SimContext, steps: number): Promise<void> {
  for (let i = 0; i < steps; i++) {
    mod.update!(0.25, ctx);
    await mod.idle();
  }
}

describe('perception module (runtime pur)', () => {
  it('ticks at 2 Hz sim and emits ripe_detected once after n consecutive detections, tagged hsv', async () => {
    const calls: number[] = [];
    const { deps: d, ctx, events } = deps({ hsv: detectorAt(0.8, calls) });
    const mod = createPerceptionModule(d);
    mod.init(ctx);
    await mod.loaded();
    await run(mod, ctx, 4); // 1 s sim → 2 ticks
    expect(calls).toEqual([640, 640]);
    expect(events).toEqual([]);
    await run(mod, ctx, 2); // 3e tick
    expect(events).toEqual([{ type: 'ripe_detected', tomatoId: 1, detector: 'hsv', confidence: 0.8 }]);
    await run(mod, ctx, 10);
    expect(events).toHaveLength(1);
    expect(mod.state()).toMatchObject({ opencvReady: false, yoloReady: false, lastDetector: 'hsv' });
    expect(mod.state().lastDetections).toHaveLength(1);
  });

  // Issue #36 : la décision « mûre » sort du traitement d'image, jamais du store.
  it('wakes on what the detector sees, even when the sim calls the tomato unripe', async () => {
    const turning = deps({}, 'turning');
    const m1 = createPerceptionModule(turning.deps);
    m1.init(turning.ctx);
    await run(m1, turning.ctx, 6);
    expect(turning.events).toEqual([{ type: 'ripe_detected', tomatoId: 1, detector: 'hsv', confidence: 0.8 }]);

    const unripe = deps({}, 'unripe');
    const m2 = createPerceptionModule(unripe.deps);
    m2.init(unripe.ctx);
    await run(m2, unripe.ctx, 6);
    expect(unripe.events).toHaveLength(1);
  });

  it('stays silent on a tomato the sim calls ripe while the detector sees nothing', async () => {
    const blind = deps({ hsv: () => [] }, 'ripe');
    const mod = createPerceptionModule(blind.deps);
    mod.init(blind.ctx);
    await run(mod, blind.ctx, 20);
    expect(blind.events).toEqual([]);
    expect(mod.state().gate).toEqual({ tomatoId: null, count: 0, target: 3 });
  });

  it('exposes the detector input frame, its inference time and the wake gate progress', async () => {
    const img = makeRgba(DETECTOR_INPUT_PX, DETECTOR_INPUT_PX, [12, 34, 56]);
    const { deps: d, ctx } = deps({ captureFront: () => img });
    const mod = createPerceptionModule(d);
    mod.init(ctx);
    await mod.loaded();
    expect(mod.state().lastImage).toBeNull();
    await run(mod, ctx, 2);
    expect(mod.state().lastImage).toBe(img);
    expect(mod.state().lastInferenceMs).toBeGreaterThanOrEqual(0);
    expect(mod.state().gate).toEqual({ tomatoId: 1, count: 1, target: 3 });
    await run(mod, ctx, 2);
    expect(mod.state().gate).toEqual({ tomatoId: 1, count: 2, target: 3 });
  });

  it('prefers YOLO when its score reaches 0.4 and falls back to HSV below', async () => {
    const strong = deps({ loadYolo: async () => detectorAt(0.9) });
    const m1 = createPerceptionModule(strong.deps);
    m1.init(strong.ctx);
    await m1.loaded();
    expect(m1.state().yoloReady).toBe(true);
    await run(m1, strong.ctx, 6);
    expect(strong.events[0]).toMatchObject({ detector: 'yolo', confidence: 0.9 });

    const weak = deps({ loadYolo: async () => detectorAt(0.3), hsv: detectorAt(0.7) });
    const m2 = createPerceptionModule(weak.deps);
    m2.init(weak.ctx);
    await m2.loaded();
    await run(m2, weak.ctx, 6);
    expect(weak.events[0]).toMatchObject({ detector: 'hsv', confidence: 0.7 });
  });

  it('re-arms after plant_regenerated and wires the edge filter once OpenCV is ready', async () => {
    const set: EdgeFilter[] = [];
    const filter: EdgeFilter = (img) => img;
    const { deps: d, ctx, events } = deps({ loadEdgeFilter: async () => filter, setEdgeFilter: (f) => set.push(f) });
    const mod = createPerceptionModule(d);
    mod.init(ctx);
    await mod.loaded();
    expect(set).toEqual([filter]);
    expect(mod.state().opencvReady).toBe(true);
    await run(mod, ctx, 6);
    expect(events).toHaveLength(1);
    ctx.signals.emit({ type: 'plant_regenerated', seed: 2 });
    expect(mod.state().gate).toEqual({ tomatoId: null, count: 0, target: 3 });
    await run(mod, ctx, 6);
    expect(events).toHaveLength(2);
  });

  it('skips ticks without an image and never overlaps two detections', async () => {
    const calls: number[] = [];
    let release: (() => void) | null = null;
    const slow: RipeDetector = (img) => {
      calls.push(img.width);
      return new Promise<Detection[]>((resolve) => {
        release = () => resolve([]);
      });
    };
    const { deps: d, ctx } = deps({ hsv: slow });
    const mod = createPerceptionModule(d);
    mod.init(ctx);
    mod.update!(0.5, ctx);
    mod.update!(0.5, ctx);
    mod.update!(0.5, ctx);
    expect(calls).toHaveLength(1);
    release!();
    await mod.idle();
    mod.update!(0.5, ctx);
    expect(calls).toHaveLength(2);

    const none = deps({ captureFront: () => null, hsv: detectorAt(0.9, calls) });
    const m2 = createPerceptionModule(none.deps);
    m2.init(none.ctx);
    await run(m2, none.ctx, 6);
    expect(calls).toHaveLength(2);
  });

  it('wakes once per tomato when they redden one after the other (issue #23)', async () => {
    const SECOND_POS: Vec3 = [-14, 0, 40];
    const { ctx, events } = makeCtx([testTomato(1, TOMATO_POS, 'ripe'), testTomato(2, SECOND_POS, 'unripe')]);
    // Le détecteur ne voit que ce qui est rouge dans l'image : le test change l'image, jamais le store.
    let red: Vec3[] = [TOMATO_POS];
    const seen: RipeDetector = (img) => red.map((pos) => boxAt(pos, img.width, 0.8));
    const mod = createPerceptionModule({
      captureFront: () => makeRgba(DETECTOR_INPUT_PX, DETECTOR_INPUT_PX),
      hsv: seen,
      loadYolo: async () => null,
      loadEdgeFilter: noEdges,
      setEdgeFilter: () => undefined,
      options: { consecutiveFrames: 3 },
    });
    mod.init(ctx);
    await mod.loaded();
    await run(mod, ctx, 12);
    expect(events).toEqual([{ type: 'ripe_detected', tomatoId: 1, detector: 'hsv', confidence: 0.8 }]);

    // La seconde rougit à son tour : la porte repart sur elle, sans jamais réarmer sur la première,
    // qui reste rouge et visible dans l'image.
    red = [TOMATO_POS, SECOND_POS];
    await run(mod, ctx, 4);
    expect(events).toHaveLength(1);
    await run(mod, ctx, 4);
    expect(events).toEqual([
      { type: 'ripe_detected', tomatoId: 1, detector: 'hsv', confidence: 0.8 },
      { type: 'ripe_detected', tomatoId: 2, detector: 'hsv', confidence: 0.8 },
    ]);
    await run(mod, ctx, 20);
    expect(events).toHaveLength(2);
  });

  it('notifies subscribers on every state change', async () => {
    const { deps: d, ctx } = deps({});
    const mod = createPerceptionModule(d);
    const seen: string[] = [];
    const off = mod.subscribe((s) => seen.push(`${s.yoloReady}/${s.lastDetector ?? '-'}`));
    mod.init(ctx);
    await mod.loaded();
    await run(mod, ctx, 2);
    off();
    await run(mod, ctx, 2);
    expect(seen).toEqual(['false/-', 'false/hsv']);
  });
});
