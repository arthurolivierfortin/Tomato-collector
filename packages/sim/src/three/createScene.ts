import {
  AmbientLight, Color, DirectionalLight, GridHelper, HemisphereLight, Mesh, MeshStandardMaterial,
  PCFSoftShadowMap, PerspectiveCamera, PlaneGeometry, Scene, WebGLRenderer,
} from 'three';
import type { Object3D } from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { worldToThree } from './frame';
import { SPECTATOR_LAYER } from './layers';
import { WIDE_FRAMING } from './spectatorFraming';

export interface SceneHandle {
  scene: Scene;
  renderer: WebGLRenderer;
  camera: PerspectiveCamera;
  controls: OrbitControls;
  addObject(obj: Object3D): void;
  /** Rappel à chaque frame avec le dt réel en secondes, avant le rendu. */
  onFrame(cb: (dtS: number) => void): () => void;
  /**
   * Rappel juste **après** le rendu principal, pour dessiner par-dessus sans le recouvrir : c'est là
   * que l'incrustation de la caméra outil rend sa seconde passe (issue #42).
   */
  onAfterRender(cb: () => void): () => void;
  dispose(): void;
}

export function createScene(canvas: HTMLCanvasElement): SceneHandle {
  const renderer = new WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = PCFSoftShadowMap;

  const scene = new Scene();
  scene.background = new Color('#0f1214');

  // Cadrage par défaut : `WIDE_FRAMING` (issue #42), posé ici pour que la première frame soit déjà
  // cadrée ; `attachFraming` le repose au montage du dashboard et gère la bascule vers la coupe.
  const camera = new PerspectiveCamera(40, 1, 1, 2000);
  // Décor réservé au spectateur (ciseaux détaillés) : invisible aux caméras de l'agent (voir layers.ts).
  camera.layers.enable(SPECTATOR_LAYER);
  camera.position.copy(worldToThree(WIDE_FRAMING.eyeCm));
  camera.lookAt(worldToThree(WIDE_FRAMING.targetCm));

  const controls = new OrbitControls(camera, canvas);
  controls.target.copy(worldToThree(WIDE_FRAMING.targetCm));
  controls.enableDamping = true;

  scene.add(new HemisphereLight('#dfe9f3', '#2a2a2a', 0.9));
  scene.add(new AmbientLight('#ffffff', 0.25));
  const sun = new DirectionalLight('#fff4e0', 2.2);
  sun.position.copy(worldToThree([120, -80, 220]));
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.left = -150;
  sun.shadow.camera.right = 150;
  sun.shadow.camera.top = 150;
  sun.shadow.camera.bottom = -150;
  sun.shadow.camera.far = 600;
  scene.add(sun);

  const floor = new Mesh(
    new PlaneGeometry(400, 400),
    new MeshStandardMaterial({ color: '#3a3f3b', roughness: 0.95 }),
  );
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  scene.add(floor);
  const grid = new GridHelper(400, 40, '#4a5250', '#2c3230');
  grid.position.y = 0.05;
  scene.add(grid);

  function resize(): void {
    const { clientWidth, clientHeight } = canvas;
    if (clientWidth === 0 || clientHeight === 0) return;
    renderer.setSize(clientWidth, clientHeight, false);
    camera.aspect = clientWidth / clientHeight;
    camera.updateProjectionMatrix();
  }
  const observer = new ResizeObserver(resize);
  observer.observe(canvas);
  resize();

  const frameCallbacks = new Set<(dtS: number) => void>();
  const afterRenderCallbacks = new Set<() => void>();
  let running = true;
  let last = performance.now();
  function loop(now: number): void {
    if (!running) return;
    const dtS = Math.min((now - last) / 1000, 0.1);
    last = now;
    for (const cb of frameCallbacks) cb(dtS);
    controls.update();
    renderer.render(scene, camera);
    for (const cb of afterRenderCallbacks) cb();
    requestAnimationFrame(loop);
  }
  requestAnimationFrame(loop);

  return {
    scene,
    renderer,
    camera,
    controls,
    addObject: (obj) => scene.add(obj),
    onFrame: (cb) => {
      frameCallbacks.add(cb);
      return () => frameCallbacks.delete(cb);
    },
    onAfterRender: (cb) => {
      afterRenderCallbacks.add(cb);
      return () => afterRenderCallbacks.delete(cb);
    },
    dispose: () => {
      running = false;
      observer.disconnect();
      controls.dispose();
      renderer.dispose();
    },
  };
}
