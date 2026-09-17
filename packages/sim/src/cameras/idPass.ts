import { Color, LinearSRGBColorSpace, MeshBasicMaterial, type Material, type Mesh, type Object3D, type Scene, type Texture, type WebGLRenderer } from 'three';
import { readTargetPixels, type AgentCamera } from './agentCameras';
import { countIdPixels, idColor } from './visibility';

const BLACK = new Color(0, 0, 0);
const idMaterials = new Map<number, MeshBasicMaterial>();
const occluderMaterials = new WeakMap<Material, MeshBasicMaterial>();

function isMesh(o: Object3D): o is Mesh {
  return (o as Partial<Mesh>).isMesh === true;
}

/** Lignes, points et sprites : rendables mais sans matériau maillé ; masqués pendant la passe. */
function isOtherRenderable(o: Object3D): boolean {
  const r = o as { isLine?: boolean; isPoints?: boolean; isSprite?: boolean };
  return r.isLine === true || r.isPoints === true || r.isSprite === true;
}

/** Couleur plate en espace linéaire : l'octet rouge relu vaut exactement l'identifiant. */
function idMaterial(id: number): MeshBasicMaterial {
  let m = idMaterials.get(id);
  if (!m) {
    const [r, g, b] = idColor(id);
    m = new MeshBasicMaterial({ toneMapped: false, fog: false });
    m.color.setRGB(r / 255, g / 255, b / 255, LinearSRGBColorSpace);
    idMaterials.set(id, m);
  }
  return m;
}

/** Noir plat qui conserve la découpe alpha (feuilles), la face rendue et la texture du matériau d'origine. */
function occluderMaterial(source: Material): MeshBasicMaterial {
  let m = occluderMaterials.get(source);
  if (!m) {
    const withMap = source as Material & { map?: Texture | null };
    m = new MeshBasicMaterial({
      color: BLACK,
      map: withMap.map ?? null,
      alphaTest: source.alphaTest,
      side: source.side,
      toneMapped: false,
      fog: false,
    });
    occluderMaterials.set(source, m);
  }
  return m;
}

function replacementFor(mesh: Mesh): Material | Material[] {
  const tomatoId: unknown = mesh.userData['tomatoId'];
  if (typeof tomatoId === 'number') return idMaterial(tomatoId);
  const original = mesh.material;
  return Array.isArray(original) ? original.map(occluderMaterial) : occluderMaterial(original);
}

/**
 * Passe d'identifiants : chaque tomate en couleur plate unique, tout le reste en noir, fond noir,
 * puis comptage des pixels par identifiant. La scène est restaurée avant de rendre la main.
 */
export function renderIdPass(renderer: WebGLRenderer, scene: Scene, cam: AgentCamera): Map<number, number> {
  const restores: (() => void)[] = [];
  scene.traverse((o) => {
    if (isMesh(o)) {
      const original = o.material;
      o.material = replacementFor(o);
      restores.push(() => {
        o.material = original;
      });
    } else if (isOtherRenderable(o) && o.visible) {
      o.visible = false;
      restores.push(() => {
        o.visible = true;
      });
    }
  });
  const background = scene.background;
  scene.background = BLACK;
  try {
    return countIdPixels(readTargetPixels(renderer, scene, cam));
  } finally {
    scene.background = background;
    for (const restore of restores) restore();
  }
}
