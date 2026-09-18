import { VIEW_SIZE_PX, type DetectorKind, type Vec2, type Vec3, type WorldState } from '@tomato/shared';
import type { EdgeFilter } from '../cameras/edges';
import { projectToPixel } from '../cameras/ortho';
import type { SimContext, SimModule } from '../core/module';
import { matchDetections } from './matching';
import type { Detection, PerceptionState, RgbaImage, RipeDetector } from './types';
import { DEFAULT_CONSECUTIVE_FRAMES, createWakeGate } from './wakeGate';

/** Période du détecteur en temps sim : 2 Hz (spec 4.4). */
export const PERCEPTION_PERIOD_S = 0.5;
/** Score YOLO minimal pour faire confiance au modèle ; en dessous, repli sur HSV (spec 4.4). */
export const YOLO_ACCEPT_SCORE_MIN = 0.4;

export interface PerceptionOptions {
  consecutiveFrames: number;
  /** Garde-fou de démo : n'annonce que des tomates dont `state === 'ripe'` dans le store (désactivable). */
  groundTruthGuard: boolean;
  periodS: number;
  yoloScoreMin: number;
}

export const DEFAULT_PERCEPTION_OPTIONS: PerceptionOptions = {
  consecutiveFrames: DEFAULT_CONSECUTIVE_FRAMES,
  groundTruthGuard: true,
  periodS: PERCEPTION_PERIOD_S,
  yoloScoreMin: YOLO_ACCEPT_SCORE_MIN,
};

/** Dépendances injectées : le navigateur fournit le rendu, OpenCV et ONNX ; les tests, des faux. */
export interface PerceptionDeps {
  /** Image brute de la caméra front du runtime courant (`ctx.scene`), déjà réduite au carré du détecteur ; null sans scène. */
  captureFront: (ctx: SimContext) => RgbaImage | null;
  hsv: RipeDetector;
  loadYolo: () => Promise<RipeDetector | null>;
  loadEdgeFilter: () => Promise<EdgeFilter | null>;
  setEdgeFilter: (filter: EdgeFilter) => void;
  options?: Partial<PerceptionOptions>;
}

export interface PerceptionModule extends SimModule {
  state(): PerceptionState;
  subscribe(fn: (state: PerceptionState) => void): () => void;
  /** Résolue quand le tick en cours (détection asynchrone) est terminé. */
  idle(): Promise<void>;
  /** Résolue quand les chargements lancés par `init` (OpenCV, YOLO) sont terminés. */
  loaded(): Promise<void>;
}

/** Projection monde → pixels de l'image du détecteur (vue front réduite de VIEW_SIZE_PX à sizePx). */
export function frontProjector(world: WorldState, sizePx: number): (posCm: Vec3) => Vec2 {
  const k = sizePx / VIEW_SIZE_PX;
  const pose = world.cameras.front;
  return (posCm) => {
    const [px, py] = projectToPixel('front', pose, posCm);
    return [px * k, py * k];
  };
}

export function createPerceptionModule(deps: PerceptionDeps): PerceptionModule {
  const opts: PerceptionOptions = { ...DEFAULT_PERCEPTION_OPTIONS, ...deps.options };
  const gate = createWakeGate(opts.consecutiveFrames);
  const announced = new Set<number>();
  const listeners = new Set<(s: PerceptionState) => void>();
  let state: PerceptionState = { opencvReady: false, yoloReady: false, lastDetector: null, lastDetections: [] };
  let yolo: RipeDetector | null = null;
  let accumulatedS = 0;
  let inFlight: Promise<void> | null = null;
  let loading: Promise<void> = Promise.resolve();

  const publish = (patch: Partial<PerceptionState>): void => {
    state = { ...state, ...patch };
    for (const fn of listeners) fn(state);
  };

  /** YOLO d'abord s'il est chargé et confiant ; sinon HSV. */
  async function detect(img: RgbaImage): Promise<{ detections: Detection[]; detector: DetectorKind }> {
    if (yolo) {
      try {
        const detections = await yolo(img);
        if (detections.some((d) => d.label === 'ripe' && d.score >= opts.yoloScoreMin)) return { detections, detector: 'yolo' };
      } catch (error) {
        console.warn('[perception] YOLO en erreur, HSV seul désormais', error);
        yolo = null;
        publish({ yoloReady: false });
      }
    }
    return { detections: await deps.hsv(img), detector: 'hsv' };
  }

  async function tick(ctx: SimContext, img: RgbaImage): Promise<void> {
    const world = ctx.store.get();
    const { detections, detector } = await detect(img);
    const trusted = detector === 'yolo' ? detections.filter((d) => d.score >= opts.yoloScoreMin) : detections;
    const matches = matchDetections(trusted, world.tomatoes, frontProjector(world, img.width));
    const byId = new Map(world.tomatoes.map((t) => [t.id, t]));
    const candidate =
      matches.find((m) => !announced.has(m.tomatoId) && (!opts.groundTruthGuard || byId.get(m.tomatoId)?.state === 'ripe')) ?? null;
    const woke = gate.push(candidate?.tomatoId ?? null);
    if (woke !== null && candidate) {
      announced.add(woke);
      ctx.emitEvent({ type: 'ripe_detected', tomatoId: woke, detector, confidence: candidate.score });
    }
    publish({ lastDetector: detector, lastDetections: detections });
  }

  return {
    name: 'perception',
    init(ctx) {
      ctx.signals.on('plant_regenerated', () => {
        announced.clear();
        gate.reset();
      });
      loading = Promise.all([
        deps.loadEdgeFilter().then((filter) => {
          if (!filter) return;
          deps.setEdgeFilter(filter);
          publish({ opencvReady: true });
        }),
        deps.loadYolo().then((detector) => {
          yolo = detector;
          publish({ yoloReady: detector !== null });
        }),
      ]).then(() => undefined);
    },
    update(dtSimS, ctx) {
      accumulatedS += dtSimS;
      if (accumulatedS < opts.periodS) return;
      accumulatedS = 0;
      if (inFlight) return;
      const img = deps.captureFront(ctx);
      if (!img) return;
      inFlight = tick(ctx, img)
        .catch((error: unknown) => console.warn('[perception] tick en erreur', error))
        .finally(() => {
          inFlight = null;
        });
    },
    state: () => state,
    subscribe: (fn) => {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    idle: () => inFlight ?? Promise.resolve(),
    loaded: () => loading,
  };
}
