import { CylinderGeometry, Group, Mesh, MeshStandardMaterial, SphereGeometry, Vector3 } from 'three';
import type { Vec3 } from '@tomato/shared';
import { worldToThree } from '../three/frame';
import { buildScissorsMesh } from './buildScissorsMesh';
import { armJoints } from './ik';
import type { ArmAngles } from './ik';
import type { ScissorsPoints } from './scissorsGeometry';

/** Palette (spec section 6) : bras gris neutre, articulations gris foncé. Les ciseaux ont leur module. */
const ARM_COLOR = '#9ca3af';
const JOINT_COLOR = '#6b7280';
const BASE_HEIGHT_CM = 4;
const UP = new Vector3(0, 1, 0);

const armMaterial = new MeshStandardMaterial({ color: ARM_COLOR, roughness: 0.55, metalness: 0.35 });
const jointMaterial = new MeshStandardMaterial({ color: JOINT_COLOR, roughness: 0.5, metalness: 0.4 });

/** Place un mesh dont la géométrie mesure 1 le long de Y entre deux points monde. */
function placeSegment(mesh: Mesh, fromCm: Vec3, toCm: Vec3): void {
  const a = worldToThree(fromCm);
  const b = worldToThree(toCm);
  const dir = new Vector3().subVectors(b, a);
  const len = dir.length();
  mesh.position.copy(a).addScaledVector(dir, 0.5);
  mesh.scale.set(1, Math.max(len, 1e-3), 1);
  if (len > 1e-6) mesh.quaternion.setFromUnitVectors(UP, dir.normalize());
}

function cylinder(radiusCm: number, material: MeshStandardMaterial): Mesh {
  const mesh = new Mesh(new CylinderGeometry(radiusCm, radiusCm, 1, 16), material);
  mesh.castShadow = true;
  return mesh;
}

function joint(radiusCm: number): Mesh {
  const mesh = new Mesh(new SphereGeometry(radiusCm, 16, 12), jointMaterial);
  mesh.castShadow = true;
  return mesh;
}

export interface ArmMesh {
  group: Group;
  pose(baseCm: Vec3, angles: ArmAngles, points: ScissorsPoints): void;
}

export function buildArmMesh(): ArmMesh {
  const group = new Group();
  group.name = 'robot-arm';
  const base = new Mesh(new CylinderGeometry(6, 7, BASE_HEIGHT_CM, 24), jointMaterial);
  base.castShadow = true;
  const column = cylinder(2.5, armMaterial);
  const upper = cylinder(2, armMaterial);
  const fore = cylinder(1.6, armMaterial);
  const shoulder = joint(3);
  const elbow = joint(2.6);
  const wrist = joint(1.6);
  const scissors = buildScissorsMesh();
  group.add(base, column, upper, fore, shoulder, elbow, wrist, scissors.group);
  return {
    group,
    pose(baseCm, angles, points) {
      const j = armJoints(baseCm, angles);
      base.position.copy(worldToThree([baseCm[0], baseCm[1], baseCm[2] + BASE_HEIGHT_CM / 2]));
      placeSegment(column, baseCm, j.shoulderCm);
      placeSegment(upper, j.shoulderCm, j.elbowCm);
      placeSegment(fore, j.elbowCm, points.pivotCm);
      shoulder.position.copy(worldToThree(j.shoulderCm));
      elbow.position.copy(worldToThree(j.elbowCm));
      wrist.position.copy(worldToThree(points.pivotCm));
      scissors.pose(points);
    },
  };
}
