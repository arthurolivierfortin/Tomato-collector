import {
  AmbientLight, Color, DirectionalLight, GridHelper, HemisphereLight, Mesh, MeshStandardMaterial,
  PCFSoftShadowMap, PerspectiveCamera, PlaneGeometry, Scene, WebGLRenderer,
} from 'three';
import type { Object3D } from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { worldToThree } from './frame';

export interface SceneHandle {
  scene: Scene;
  renderer: WebGLRenderer;
  camera: PerspectiveCamera;
  controls: OrbitControls;
  addObject(obj: Object3D): void;
  dispose(): void;
}

export function createScene(canvas: HTMLCanvasElement): SceneHandle {
  const renderer = new WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = PCFSoftShadowMap;

  const scene = new Scene();
  scene.background = new Color('#0f1214');

  const camera = new PerspectiveCamera(40, 1, 1, 2000);
  camera.position.copy(worldToThree([110, -130, 85]));
  camera.lookAt(worldToThree([0, 0, 45]));

  const controls = new OrbitControls(camera, canvas);
  controls.target.copy(worldToThree([0, 0, 45]));
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

  let running = true;
  function loop(): void {
    if (!running) return;
    controls.update();
    renderer.render(scene, camera);
    requestAnimationFrame(loop);
  }
  requestAnimationFrame(loop);

  return {
    scene,
    renderer,
    camera,
    controls,
    addObject: (obj) => scene.add(obj),
    dispose: () => {
      running = false;
      observer.disconnect();
      controls.dispose();
      renderer.dispose();
    },
  };
}
