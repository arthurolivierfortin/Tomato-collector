import { VIEW_SIZE_PX, type CameraId, type DetectorKind, type Vec2, type Vec3, type WorldState } from '@tomato/shared';
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

/** Échecs d'inférence consécutifs tolérés avant de passer en mode dégradé HSV. */
export const YOLO_MAX_FAILURES = 3;
/** En mode dégradé, une tentative de retour au modèle tous les N ticks (5 s de temps sim par défaut). */
export const YOLO_RETRY_EVERY_TICKS = 10;

export interface PerceptionOptions {
  consecutiveFrames: number;
  periodS: number;
  yoloScoreMin: number;
  yoloMaxFailures: number;
  yoloRetryEveryTicks: number;
}

export const DEFAULT_PERCEPTION_OPTIONS: PerceptionOptions = {
  consecutiveFrames: DEFAULT_CONSECUTIVE_FRAMES,
  periodS: PERCEPTION_PERIOD_S,
  yoloScoreMin: YOLO_ACCEPT_SCORE_MIN,
  yoloMaxFailures: YOLO_MAX_FAILURES,
  yoloRetryEveryTicks: YOLO_RETRY_EVERY_TICKS,
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

/** Résultat d'une analyse à la demande (mode pipeline, issue #36) : les boîtes et ce qui les a produites. */
export interface AnalyzeResult {
  detections: Detection[];
  detector: DetectorKind;
  inferenceMs: number;
}

export interface PerceptionModule extends SimModule {
  state(): PerceptionState;
  subscribe(fn: (state: PerceptionState) => void): () => void;
  /** Résolue quand le tick en cours (détection asynchrone) est terminé. */
  idle(): Promise<void>;
  /** Résolue quand les chargements lancés par `init` (OpenCV, YOLO) sont terminés. */
  loaded(): Promise<void>;
  /** Passe une image dans le détecteur actif sans toucher à la porte de réveil (mode pipeline). */
  analyze(img: RgbaImage): Promise<AnalyzeResult>;
}

/** Projection monde → pixels d'une vue réduite de VIEW_SIZE_PX à sizePx, pour la caméra donnée. */
export function viewProjector(camId: CameraId, world: WorldState, sizePx: number): (posCm: Vec3) => Vec2 {
  const k = sizePx / VIEW_SIZE_PX;
  const pose = world.cameras[camId];
  return (posCm) => {
    const [px, py] = projectToPixel(camId, pose, posCm);
    return [px * k, py * k];
  };
}

/** Projection monde → pixels de l'image du détecteur (vue front réduite de VIEW_SIZE_PX à sizePx). */
export function frontProjector(world: WorldState, sizePx: number): (posCm: Vec3) => Vec2 {
  return viewProjector('front', world, sizePx);
}

export function createPerceptionModule(deps: PerceptionDeps): PerceptionModule {
  const opts: PerceptionOptions = { ...DEFAULT_PERCEPTION_OPTIONS, ...deps.options };
  const gate = createWakeGate(opts.consecutiveFrames);
  const announced = new Set<number>();
  const listeners = new Set<(s: PerceptionState) => void>();
  let state: PerceptionState = {
    opencvReady: false,
    yoloReady: false,
    lastDetector: null,
    lastDetections: [],
    lastImage: null,
    lastInferenceMs: null,
    gate: gate.progress(),
  };
  let yolo: RipeDetector | null = null;
  /** Échecs d'inférence consécutifs ; remis à zéro par la première réussite. */
  let yoloFailures = 0;
  /** Ticks passés en mode dégradé depuis la dernière tentative de retour au modèle. */
  let sinceRetry = 0;
  let accumulatedS = 0;
  let inFlight: Promise<void> | null = null;
  let loading: Promise<void> = Promise.resolve();

  const publish = (patch: Partial<PerceptionState>): void => {
    state = { ...state, ...patch };
    for (const fn of listeners) fn(state);
  };

  /**
   * Le modèle décide SEUL quand il est chargé, y compris quand il ne voit aucune tomate mûre : un
   * silence du modèle est une réponse, pas une panne, et rattraper ce silence avec HSV ferait rentrer
   * par la fenêtre un détecteur que le dashboard n'annonce pas (issue #36, revue de PR #38).
   *
   * HSV ne reprend la main que si le modèle est absent ou en erreur. Une erreur isolée (frame perdue,
   * worker occupé) ne condamne plus la session : il faut `yoloMaxFailures` échecs consécutifs pour
   * passer en mode dégradé, et la première inférence réussie ramène le modèle.
   */
  async function detect(img: RgbaImage): Promise<{ detections: Detection[]; detector: DetectorKind }> {
    const degraded = yoloFailures >= opts.yoloMaxFailures;
    if (yolo !== null && (!degraded || sinceRetry >= opts.yoloRetryEveryTicks)) {
      sinceRetry = 0;
      try {
        const detections = await yolo(img);
        if (degraded) {
          console.info('[perception] YOLO de nouveau opérationnel');
          publish({ yoloReady: true });
        }
        yoloFailures = 0;
        return { detections, detector: 'yolo' };
      } catch (error) {
        yoloFailures++;
        console.warn(`[perception] inférence YOLO en échec (${yoloFailures}/${opts.yoloMaxFailures})`, error);
        if (yoloFailures === opts.yoloMaxFailures) publish({ yoloReady: false });
      }
    } else if (yolo !== null) sinceRetry++;
    return { detections: await deps.hsv(img), detector: 'hsv' };
  }

  async function analyze(img: RgbaImage): Promise<AnalyzeResult> {
    const startedMs = performance.now();
    const { detections, detector } = await detect(img);
    return { detections, detector, inferenceMs: performance.now() - startedMs };
  }

  async function tick(ctx: SimContext, img: RgbaImage): Promise<void> {
    const world = ctx.store.get();
    const { detections, detector, inferenceMs } = await analyze(img);
    const trusted = detector === 'yolo' ? detections.filter((d) => d.score >= opts.yoloScoreMin) : detections;
    // Issue #36 : l'association boîte → tomate est purement géométrique (centre projeté le plus proche).
    // La maturité vient du détecteur, jamais de `tomato.state` : aucune garde de vérité terrain ici.
    const matches = matchDetections(trusted, world.tomatoes, frontProjector(world, img.width));
    const candidate = matches.find((m) => !announced.has(m.tomatoId)) ?? null;
    const woke = gate.push(candidate?.tomatoId ?? null);
    if (woke !== null && candidate) {
      announced.add(woke);
      ctx.emitEvent({ type: 'ripe_detected', tomatoId: woke, detector, confidence: candidate.score });
    }
    publish({ lastDetector: detector, lastDetections: detections, lastImage: img, lastInferenceMs: inferenceMs, gate: gate.progress() });
  }

  return {
    name: 'perception',
    init(ctx) {
      ctx.signals.on('plant_regenerated', () => {
        announced.clear();
        gate.reset();
        publish({ gate: gate.progress() });
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
      // La période n'est consommée que lorsqu'une détection part vraiment : si la précédente dure plus
      // longtemps que la période, la suivante enchaîne aussitôt au lieu de perdre un tour. La porte
      // compte donc des frames traitées, jamais des tours sautés (revue visuelle de PR #38).
      if (inFlight) return;
      accumulatedS = 0;
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
    analyze,
  };
}
