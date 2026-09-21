import { describe, expect, it } from 'vitest';
import { Group, Mesh, Vector3 } from 'three';
import type { Object3D } from 'three';
import { Scene } from 'three';
import { createAgentCameras } from '../cameras/agentCameras';
import { AGENT_LAYER, SPECTATOR_LAYER } from '../three/layers';
import { worldToThree } from '../three/frame';
import { buildScissorsMesh, SCISSORS_PART_NAMES } from './buildScissorsMesh';
import { BLADE_LENGTH_CM, poseFromAngles, scissorsPoints } from './scissorsGeometry';

const meshes = (root: Object3D): Mesh[] => {
  const found: Mesh[] = [];
  root.traverse((o) => {
    if ((o as Partial<Mesh>).isMesh === true) found.push(o as Mesh);
  });
  return found;
};

const half = (root: Object3D, name: string): Group => {
  const g = root.getObjectByName(name);
  if (!(g instanceof Group)) throw new Error(`demi-ciseau ${name} absent`);
  return g;
};

/** Direction de la lame d'un demi-ciseau : son axe Y local, en monde Three. */
const bladeDirection = (g: Group): Vector3 => new Vector3(0, 1, 0).applyQuaternion(g.getWorldQuaternion(g.quaternion.clone()));

describe('buildScissorsMesh', () => {
  it('assemble neuf pièces de décor et les deux lames du schéma des vues', () => {
    const mesh = buildScissorsMesh();
    const all = meshes(mesh.group);
    // Décor : par demi-ciseau une lame, son arête sombre, son liseré magenta et son anneau ; plus l'axe.
    const detail = all.filter((m) => m.layers.mask === (1 << SPECTATOR_LAYER));
    const schematic = all.filter((m) => m.layers.mask === (1 << AGENT_LAYER));
    expect(detail).toHaveLength(9);
    expect(schematic).toHaveLength(2);
    expect(all).toHaveLength(11);
    // Aucune pièce sur la couche commune : le décor ne doit pas entrer dans les vues de l'agent,
    // ni le schéma de l'agent s'ajouter au décor de la vue spectateur.
    expect(all.filter((m) => m.layers.test(new Mesh().layers))).toHaveLength(0);
    expect(new Set(all.map((m) => m.name)).size).toBe(all.length);
    expect(SCISSORS_PART_NAMES.pivot).toBe('scissors-pivot');
  });

  // Ce que voient les caméras de l'agent part dans `get_views`, sert de jeu d'entraînement au
  // détecteur et alimente la passe d'identifiants : le décor ne doit pas y entrer.
  it('reste invisible aux caméras de l’agent, qui ne voient que le schéma', () => {
    const mesh = buildScissorsMesh();
    const all = meshes(mesh.group);
    const cams = createAgentCameras(new Scene());
    for (const cam of [cams.top, cams.front, cams.side]) {
      const seen = all.filter((m) => m.layers.test(cam.camera.layers)).map((m) => m.name);
      expect(seen).toEqual(['scissors-agent-blade-a', 'scissors-agent-blade-b']);
    }
  });

  it('applique l’ouverture : l’angle entre les deux lames vaut openingDeg', () => {
    const mesh = buildScissorsMesh();
    for (const openingDeg of [0, 24, 60]) {
      mesh.pose(scissorsPoints(poseFromAngles([10, -5, 60], 30, -10, 0, openingDeg)));
      const a = bladeDirection(half(mesh.group, SCISSORS_PART_NAMES.halfA));
      const b = bladeDirection(half(mesh.group, SCISSORS_PART_NAMES.halfB));
      expect((a.angleTo(b) * 180) / Math.PI).toBeCloseTo(openingDeg, 4);
    }
  });

  it('pose le pivot sur le pivot et les pointes des lames sur les pointes calculées', () => {
    const mesh = buildScissorsMesh();
    const points = scissorsPoints(poseFromAngles([10, -5, 60], 30, -10, 0, 60));
    mesh.pose(points);
    const pivot = mesh.group.getObjectByName(SCISSORS_PART_NAMES.pivot)!;
    expect(pivot.position.distanceTo(worldToThree(points.pivotCm))).toBeLessThan(1e-6);
    const tipA = half(mesh.group, SCISSORS_PART_NAMES.halfA).localToWorld(new Vector3(0, BLADE_LENGTH_CM, 0));
    const tipB = half(mesh.group, SCISSORS_PART_NAMES.halfB).localToWorld(new Vector3(0, BLADE_LENGTH_CM, 0));
    expect(tipA.distanceTo(worldToThree(points.tipACm))).toBeLessThan(1e-4);
    expect(tipB.distanceTo(worldToThree(points.tipBCm))).toBeLessThan(1e-4);
  });
});
