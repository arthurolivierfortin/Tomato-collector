import {
  CatmullRomCurve3, Color, CylinderGeometry, DoubleSide, Group, Mesh, MeshStandardMaterial,
  PlaneGeometry, SphereGeometry, TubeGeometry, Vector3,
} from 'three';
import type { Vec3 } from '@tomato/shared';
import { worldToThree } from '../three/frame';
import { getLeafTexture } from './leafTexture';
import type { PlantSpec } from './generatePlant';

const stemMaterial = new MeshStandardMaterial({ color: '#4c7d3a', roughness: 0.8 });
const tomatoMaterial = () => new MeshStandardMaterial({ color: '#3f9a3a', roughness: 0.35, metalness: 0.05 });

function segmentMesh(from: Vec3, to: Vec3, radius: number): Mesh {
  const a = worldToThree(from);
  const b = worldToThree(to);
  const dir = new Vector3().subVectors(b, a);
  const len = dir.length();
  const geo = new CylinderGeometry(radius * 0.8, radius, len, 10);
  const mesh = new Mesh(geo, stemMaterial);
  mesh.position.copy(a).addScaledVector(dir, 0.5);
  mesh.quaternion.setFromUnitVectors(new Vector3(0, 1, 0), dir.normalize());
  mesh.castShadow = true;
  return mesh;
}

export function buildPlantMesh(spec: PlantSpec): Group {
  const group = new Group();
  group.name = 'plant';

  const curve = new CatmullRomCurve3(spec.mainStem.map(worldToThree));
  const stem = new Mesh(new TubeGeometry(curve, 48, spec.stemRadiusCm, 10, false), stemMaterial);
  stem.castShadow = true;
  group.add(stem);

  for (const b of spec.branches) group.add(segmentMesh(b.fromCm, b.toCm, spec.stemRadiusCm * 0.6));

  const leafTex = getLeafTexture();
  const leafMat = new MeshStandardMaterial({ map: leafTex, alphaTest: 0.5, side: DoubleSide, roughness: 0.9 });
  for (const leaf of spec.leaves) {
    const mesh = new Mesh(new PlaneGeometry(leaf.sizeCm, leaf.sizeCm * 1.4), leafMat);
    mesh.position.copy(worldToThree(leaf.positionCm));
    mesh.quaternion.setFromUnitVectors(new Vector3(0, 0, 1), worldToThree(leaf.normal).normalize());
    mesh.rotateZ((leaf.spinDeg * Math.PI) / 180);
    mesh.castShadow = true;
    group.add(mesh);
  }

  for (const t of spec.tomatoes) {
    group.add(segmentMesh(t.anchorCm, t.centerCm, 0.35));
    const mesh = new Mesh(new SphereGeometry(t.radiusCm, 24, 18), tomatoMaterial());
    mesh.scale.set(1, 0.9, 1);
    mesh.position.copy(worldToThree(t.centerCm));
    mesh.castShadow = true;
    mesh.name = `tomato-${t.id}`;
    mesh.userData.tomatoId = t.id;
    group.add(mesh);
  }

  return group;
}

/** Couleur d'un fruit selon sa maturité 0..1 (vert → orange → rouge). Utilisée par M1. */
export function tomatoColor(ripeness: number): Color {
  const green = new Color('#3f9a3a');
  const orange = new Color('#e08a1e');
  const red = new Color('#c8261b');
  return ripeness < 0.5 ? green.clone().lerp(orange, ripeness * 2) : orange.clone().lerp(red, (ripeness - 0.5) * 2);
}
