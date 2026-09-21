import { PerspectiveCamera } from 'three';
import type { Vec3 } from '@tomato/shared';
import type { SimRuntime } from '../core/runtime';
import type { SceneHandle } from '../three/createScene';
import { worldToThree } from '../three/frame';
import { SPECTATOR_LAYER } from '../three/layers';
import { scissorsPoints } from './scissorsGeometry';
import {
  INSET_ASPECT, insetRect, scissorsAtRest, smoothTowards, toolCamAutoVisible, toolCameraPose,
  TOOL_CAM_FOV_DEG, TOOL_CAM_SMOOTH_S,
} from './toolCamera';

/**
 * Rendu de la caméra outil en incrustation dans le canvas spectateur (issue #42).
 *
 * Le dessin passe par `setViewport` / `setScissor` juste après le rendu principal : une seconde
 * passe sur la **même** scène, avec la même couche `SPECTATOR_LAYER`, donc les caméras de l'agent et
 * la passe d'identifiants ne voient rien de tout cela. La carte d'ombres n'est pas recalculée : les
 * deux caméras voient exactement les mêmes casteurs, celle du rendu principal est valable telle
 * quelle, et la recalculer doublerait le coût de la frame.
 *
 * Le cadre et l'étiquette sont du DOM (`Dashboard.tsx`), posés sur le même rectangle : du texte net,
 * sans atlas de police dans la scène.
 */

const NEAR_CM = 1;
const FAR_CM = 600;

export interface ToolCameraView {
  visible(): boolean;
  /** Force l'affichage, ou rend la main à la règle automatique avec `null`. */
  force(on: boolean | null): void;
  /** Touche `j` : bascule l'état courant et le fige jusqu'à la prochaine bascule. */
  toggle(): void;
  dispose(): void;
}

export function attachToolCamera(scene: SceneHandle, runtime: SimRuntime, onVisibleChange: (visible: boolean) => void): ToolCameraView {
  const camera = new PerspectiveCamera(TOOL_CAM_FOV_DEG, INSET_ASPECT, NEAR_CM, FAR_CM);
  camera.layers.enable(SPECTATOR_LAYER);

  const start = toolCameraPose(scissorsPoints(runtime.ctx.store.get().scissors));
  let eyeCm: Vec3 = start.eyeCm;
  let targetCm: Vec3 = start.targetCm;
  let upCm: Vec3 = start.upCm;
  let sinceLandedS: number | null = null;
  let forced: boolean | null = null;
  let visible = false;

  const offEvent = runtime.onEvent((e) => {
    if (e.type === 'tomato_landed') sinceLandedS = 0;
  });

  const stopFrame = scene.onFrame((dtS) => {
    if (sinceLandedS !== null) sinceLandedS += dtS;
    const { scissors } = runtime.ctx.store.get();
    const goal = toolCameraPose(scissorsPoints(scissors));
    eyeCm = smoothTowards(eyeCm, goal.eyeCm, dtS, TOOL_CAM_SMOOTH_S);
    targetCm = smoothTowards(targetCm, goal.targetCm, dtS, TOOL_CAM_SMOOTH_S);
    upCm = goal.upCm;
    const next = forced ?? toolCamAutoVisible({ atRest: scissorsAtRest(scissors), sinceLandedS });
    if (next !== visible) {
      visible = next;
      onVisibleChange(next);
    }
  });

  const stopAfter = scene.onAfterRender(() => {
    if (!visible) return;
    const canvas = scene.renderer.domElement;
    const rect = insetRect(canvas.clientWidth);
    if (rect.widthPx <= 0 || rect.heightPx <= 0) return;
    camera.aspect = rect.widthPx / rect.heightPx;
    camera.updateProjectionMatrix();
    camera.position.copy(worldToThree(eyeCm));
    camera.up.copy(worldToThree(upCm));
    camera.lookAt(worldToThree(targetCm));

    const { renderer } = scene;
    const shadowAutoUpdate = renderer.shadowMap.autoUpdate;
    renderer.shadowMap.autoUpdate = false;
    renderer.setScissorTest(true);
    renderer.setViewport(rect.xPx, rect.yPx, rect.widthPx, rect.heightPx);
    renderer.setScissor(rect.xPx, rect.yPx, rect.widthPx, rect.heightPx);
    try {
      renderer.render(scene.scene, camera);
    } finally {
      renderer.setScissorTest(false);
      renderer.setViewport(0, 0, canvas.clientWidth, canvas.clientHeight);
      renderer.shadowMap.autoUpdate = shadowAutoUpdate;
    }
  });

  return {
    visible: () => visible,
    force: (on) => {
      forced = on;
    },
    toggle: () => {
      forced = !visible;
    },
    dispose: () => {
      offEvent();
      stopFrame();
      stopAfter();
    },
  };
}
