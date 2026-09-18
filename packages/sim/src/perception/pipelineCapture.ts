import { VIEW_SIZE_PX, type CameraId, type Vec2, type WorldState } from '@tomato/shared';
import { buildOverlay } from '../cameras/annotations';
import { renderCameraImage } from '../cameras/cameraModule';
import { clampCommands } from '../cameras/clampLabel';
import { drawCommands } from '../cameras/drawOverlay';
import { compose, darken } from '../cameras/edges';
import { grayscale } from '../cameras/edgesCore';
import { chooseSpacing } from '../cameras/gridSpacing';
import { gridCommands } from '../cameras/layerGrid';
import { headerCommands } from '../cameras/layerHeader';
import { markerCommands } from '../cameras/layerMarkers';
import { basketCommands, fallLineCommands, scissorsCommands, stemCommands } from '../cameras/layerTools';
import { pxPerCmOf } from '../cameras/ortho';
import type { OverlayCommand } from '../cameras/overlayTypes';
import { toViewsPayload } from '../cameras/payload';
import { DARKEN_FACTOR, getEdgeFilter } from '../cameras/renderViews';
import type { SceneHandle } from '../three/createScene';
import { claheGrayRgba, grayToRgba, type CvApi } from './cannyClahe';
import { matchDetections } from './matching';
import { YOLO_ACCEPT_SCORE_MIN, viewProjector, type AnalyzeResult } from './perceptionRuntime';
import { pipelineStages, type StageKey, type StageSpec } from './pipelineModel';
import { detectionCommands, matchCommands } from './pipelineOverlay';
import { resizeRgba } from './rgba';
import { DETECTOR_INPUT_PX, type RgbaImage } from './types';

const DATA_URL_PREFIX = 'data:image/png;base64,';

export interface PipelineTile extends StageSpec {
  /** PNG du tampon réel de l'étape, encodé en base64 (sans préfixe data:). */
  pngBase64: string;
}

export interface PipelineCapture {
  camera: CameraId;
  atMs: number;
  tiles: PipelineTile[];
}

export interface CaptureDeps {
  scene: SceneHandle;
  world: WorldState;
  /** OpenCV.js chargé par M4, ou null (repli Sobel sans CLAHE). */
  cv: CvApi | null;
  analyze: (img: RgbaImage) => Promise<AnalyzeResult>;
}

const toImageData = (img: RgbaImage): ImageData =>
  img instanceof ImageData ? img : new ImageData(new Uint8ClampedArray(img.data), img.width, img.height);

/** Peint une image et ses commandes d'annotation sur un canevas jetable, et renvoie son PNG base64. */
function painter(): (img: RgbaImage, cmds?: readonly OverlayCommand[]) => string {
  const canvas = document.createElement('canvas');
  return (img, cmds = []) => {
    canvas.width = img.width;
    canvas.height = img.height;
    const c = canvas.getContext('2d');
    if (c === null) return '';
    c.putImageData(toImageData(img), 0, 0);
    if (cmds.length > 0) drawCommands(c, cmds);
    const url = canvas.toDataURL('image/png');
    return url.startsWith(DATA_URL_PREFIX) ? url.slice(DATA_URL_PREFIX.length) : url;
  };
}

/** Gris égalisé par CLAHE quand OpenCV est là, gris simple sinon : le tampon qui entre dans les contours. */
function grayStage(cv: CvApi | null, base: ImageData): ImageData {
  const n = base.width * base.height;
  const data = cv === null ? grayToRgba(Uint8Array.from(grayscale(base.data, n), (v) => Math.round(v)), n) : claheGrayRgba(cv, base);
  return new ImageData(data, base.width, base.height);
}

/**
 * Mode « Pipeline de traitement » (issue #36) : rejoue, pour une caméra, la chaîne réelle qui mène de la
 * scène 3D à la vue envoyée à l'agent, et renvoie chaque tampon intermédiaire en PNG. Les images sortent
 * des mêmes fonctions que la production (`renderCameraImage`, filtre de contours actif, détecteur actif,
 * couches d'annotation) : rien n'est reconstitué côté dashboard.
 */
export async function capturePipeline(camera: CameraId, deps: CaptureDeps): Promise<PipelineCapture | null> {
  const base = renderCameraImage(deps.scene, camera);
  if (base === null) return null;
  const { world, cv } = deps;
  const payload = toViewsPayload(world);
  const pose = payload.cameras[camera];
  const spacing = chooseSpacing(pxPerCmOf(pose));
  const paint = painter();

  const composite = compose(darken(base, DARKEN_FACTOR), getEdgeFilter()(base));
  const input = resizeRgba(base, DETECTOR_INPUT_PX, DETECTOR_INPUT_PX);
  const { detections, detector, inferenceMs } = await deps.analyze(input);
  const trusted = detector === 'yolo' ? detections.filter((d) => d.score >= YOLO_ACCEPT_SCORE_MIN) : detections;
  const project = viewProjector(camera, world, DETECTOR_INPUT_PX);
  const matches = matchDetections(trusted, world.tomatoes, project);
  const projected = new Map<number, Vec2>(world.tomatoes.map((t) => [t.id, project(t.positionCm)]));

  // Sans épisode ouvert, `targetTomatoId` est nul et les couches « tige » et « chute » seraient vides :
  // le mode pipeline prend alors pour cible d'affichage la tomate que le détecteur vient d'associer,
  // et l'annonce dans les légendes. Le chemin réel n'utilise jamais cette cible provisoire.
  const episodeTarget = payload.tomatoes.find((t) => t.id === payload.targetTomatoId);
  const provisional = episodeTarget ?? payload.tomatoes.find((t) => t.id === matches[0]?.tomatoId);
  const target = provisional;
  const targetKind = episodeTarget !== undefined ? 'episode' : provisional !== undefined ? 'provisoire' : null;
  const grid = clampCommands([...gridCommands(camera, pose, spacing), ...headerCommands(camera, pose, payload, spacing)], VIEW_SIZE_PX);
  const tools = clampCommands([...scissorsCommands(camera, pose, payload.scissors), ...basketCommands(camera, pose, payload.basket)], VIEW_SIZE_PX);
  const marks = clampCommands([...markerCommands(camera, pose, payload.tomatoes, payload.targetTomatoId), ...stemCommands(camera, pose, target)], VIEW_SIZE_PX);
  const fall = clampCommands(fallLineCommands(camera, pose, target, payload.basket), VIEW_SIZE_PX);

  const png: Record<StageKey, string> = {
    raw: paint(base),
    clahe: paint(grayStage(cv, base)),
    edges: paint(composite),
    detect: paint(input, detectionCommands(detections)),
    match: paint(input, matchCommands(trusted, matches, projected)),
    grid: paint(composite, grid),
    tools: paint(composite, [...grid, ...tools]),
    markers: paint(composite, [...grid, ...tools, ...marks]),
    fall: paint(composite, [...grid, ...tools, ...marks, ...fall]),
    final: paint(composite, buildOverlay(camera, pose, payload, spacing)),
  };

  const specs = pipelineStages({
    camera,
    detector,
    inferenceMs,
    detections: detections.length,
    matched: matches.length,
    canny: cv !== null,
    inputPx: DETECTOR_INPUT_PX,
    viewPx: VIEW_SIZE_PX,
    target: targetKind,
  });
  return { camera, atMs: Date.now(), tiles: specs.map((s) => ({ ...s, pngBase64: png[s.key] })) };
}
