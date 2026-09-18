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

/** Détecteur qui renvoie une boîte de 40 px centrée sur la projection de TOMATO_POS. */
function detectorAt(score: number, calls: number[] = []): RipeDetector {
  return (img) => {
    calls.push(img.width);
    const world = { ...createDefaultWorld(1) };
    const [px, py] = frontProjector(world, img.width)(TOMATO_POS);
    const d: Detection = { bbox: [px - 20, py - 20, 40, 40], score, label: 'ripe' };
    return [d];
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

  it('ground-truth guard blocks a turning tomato; disabling it lets the detector wake the agent', async () => {
    const guarded = deps({}, 'turning');
    const m1 = createPerceptionModule(guarded.deps);
    m1.init(guarded.ctx);
    await run(m1, guarded.ctx, 12);
    expect(guarded.events).toEqual([]);

    const open = deps({ options: { consecutiveFrames: 3, groundTruthGuard: false } }, 'turning');
    const m2 = createPerceptionModule(open.deps);
    m2.init(open.ctx);
    await run(m2, open.ctx, 6);
    expect(open.events).toHaveLength(1);
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
