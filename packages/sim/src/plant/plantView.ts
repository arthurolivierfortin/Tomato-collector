import type { Group, Mesh, MeshStandardMaterial } from 'three';
import type { SceneHandle } from '../three/createScene';
import { worldToThree } from '../three/frame';
import { buildPlantMesh, tomatoColor } from './buildPlantMesh';
import type { PlantView } from './view';

interface TomatoNodes {
  fruit: Mesh;
  pedicel: Mesh | null;
  /** Rayon de la spec : l'échelle du maillage = radiusCm du store / ce rayon. */
  baseRadiusCm: number;
}

export function createPlantView(scene: SceneHandle): PlantView {
  let group: Group | null = null;
  const nodes = new Map<number, TomatoNodes>();

  return {
    setSpec(spec) {
      if (group) scene.scene.remove(group);
      group = buildPlantMesh(spec);
      scene.addObject(group);
      nodes.clear();
      for (const t of spec.tomatoes) {
        const fruit = group.getObjectByName(`tomato-${t.id}`) as Mesh | undefined;
        const pedicel = group.getObjectByName(`pedicel-${t.id}`) as Mesh | undefined;
        if (fruit) nodes.set(t.id, { fruit, pedicel: pedicel ?? null, baseRadiusCm: t.radiusCm });
      }
    },
    sync(tomatoes) {
      for (const t of tomatoes) {
        const n = nodes.get(t.id);
        if (!n) continue;
        (n.fruit.material as MeshStandardMaterial).color.copy(tomatoColor(t.ripeness));
        const s = t.radiusCm / n.baseRadiusCm;
        n.fruit.scale.set(s, s * 0.9, s);
        n.fruit.position.copy(worldToThree(t.positionCm));
        if (n.pedicel) n.pedicel.visible = t.attached;
      }
    },
    dispose() {
      if (group) scene.scene.remove(group);
      group = null;
      nodes.clear();
    },
  };
}
