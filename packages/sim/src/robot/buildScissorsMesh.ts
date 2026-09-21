import { BoxGeometry, CylinderGeometry, Group, Matrix4, Mesh, MeshStandardMaterial, TorusGeometry, Vector3 } from 'three';
import type { Vec3 } from '@tomato/shared';
import { worldToThree } from '../three/frame';
import { AGENT_LAYER, SPECTATOR_LAYER } from '../three/layers';
import { BLADE_LENGTH_CM, type ScissorsPoints } from './scissorsGeometry';

/**
 * Les ciseaux du bout du bras, en deux exemplaires et pour deux publics (issue #42).
 *
 * - Le **décor** (couche `SPECTATOR_LAYER`) : deux lames plates articulées sur l'axe, leur arête de
 *   coupe sombre, un liseré magenta côté dos — la même couleur que le schéma des vues annotées — et
 *   deux anneaux de poignée derrière le pivot. C'est ce que le propriétaire veut voir travailler.
 * - Le **schéma** (couche `AGENT_LAYER`) : les deux boîtes magenta d'avant, dimensions et matériau
 *   inchangés. Les vues de l'agent et la passe d'identifiants continuent de voir exactement ce
 *   qu'elles voyaient ; le décor leur est invisible.
 *
 * Rien ici ne définit la géométrie de coupe : le maillage suit `ScissorsPoints`, qui vient de
 * `scissorsGeometry.ts`, et la règle de coupe (`cutRule.ts`) comme les collisions ne lisent aucun
 * maillage.
 */

/** Lame du décor : plate, 6 cm de long, 1 cm de large, moins de 2 mm d'épaisseur. */
const BLADE_WIDTH_CM = 1;
const BLADE_THICKNESS_CM = 0.18;
/**
 * Arête de coupe (côté de l'autre lame) et dos de lame (côté opposé), tous deux plus épais que le
 * plat de la lame — comme une vraie lame, mince au fil et renforcée au dos.
 *
 * Ce n'est pas de la coquetterie : les ciseaux coupent un pédoncule vertical, donc leur plan est
 * **horizontal**, et la caméra spectateur les regarde de 8 à 10° au-dessus de l'horizon. Vues de si
 * près du plan, les lames ne montrent pas leur plat mais leur tranche : un plat de 1,5 mm faisait
 * moins de deux pixels. Le dos, à 4 mm, en fait quatre, et il porte le magenta du schéma des vues.
 */
const EDGE_WIDTH_CM = 0.26;
const EDGE_THICKNESS_CM = 0.3;
const RIM_WIDTH_CM = 0.22;
const RIM_THICKNESS_CM = 0.42;
/**
 * Axe d'articulation : un cylindre porté par la normale des lames, en travers du poignet. La boule
 * de poignet du bras fait 1,6 cm de rayon, donc l'axe doit dépasser 3,2 cm pour se voir : il fait
 * 4,4 cm et sort d'un demi-centimètre de chaque côté, comme une goupille.
 */
const PIVOT_RADIUS_CM = 0.8;
const PIVOT_LENGTH_CM = 4.4;
/**
 * Anneaux de poignée, derrière le pivot, dans le plan des lames. Ils étaient à 2,3 cm : à la pose de
 * repos, l'avant-bras arrive à 45° de l'axe des lames, donc ils tombaient à 1,6 cm de son axe —
 * exactement son rayon, et ils disparaissaient dedans. À 3,2 cm, ils en sortent.
 */
const HANDLE_RADIUS_CM = 1.1;
const HANDLE_TUBE_CM = 0.24;
const HANDLE_BACK_CM = 3.2;
/** Lames du schéma de l'agent : valeurs d'avant l'issue #42, à ne pas toucher. */
const SCHEMATIC_WIDTH_CM = 1.2;
const SCHEMATIC_THICKNESS_CM = 0.3;

const STEEL_COLOR = '#eef2f7';
const EDGE_COLOR = '#2f343b';
const HANDLE_COLOR = '#aeb7c2';
/** Magenta du schéma des vues annotées (spec section 6) ; gardé en liseré pour rester reconnaissable. */
const BLADE_COLOR = '#e879f9';

const UP = new Vector3(0, 1, 0);

/**
 * Métal *clair*, pas métal physique : la scène n'a pas de carte d'environnement, et un matériau à
 * `metalness` 0,9 n'y réfléchit rien — les premières lames rendaient presque noires. Le bras, lui,
 * est à 0,35 et se lit bien : les ciseaux prennent la même échelle, un cran plus clair et plus lisse.
 */
const steelMaterial = new MeshStandardMaterial({ color: STEEL_COLOR, roughness: 0.3, metalness: 0.3 });
const edgeMaterial = new MeshStandardMaterial({ color: EDGE_COLOR, roughness: 0.5, metalness: 0.25 });
const handleMaterial = new MeshStandardMaterial({ color: HANDLE_COLOR, roughness: 0.45, metalness: 0.3 });
const rimMaterial = new MeshStandardMaterial({
  color: BLADE_COLOR, roughness: 0.3, metalness: 0.5, emissive: BLADE_COLOR, emissiveIntensity: 0.35,
});
const schematicMaterial = new MeshStandardMaterial({
  color: BLADE_COLOR, roughness: 0.3, metalness: 0.5, emissive: BLADE_COLOR, emissiveIntensity: 0.25,
});

export const SCISSORS_PART_NAMES = {
  group: 'scissors',
  halfA: 'scissors-half-a',
  halfB: 'scissors-half-b',
  pivot: 'scissors-pivot',
} as const;

function part(mesh: Mesh, name: string, layer: number): Mesh {
  mesh.name = name;
  mesh.castShadow = true;
  mesh.layers.set(layer);
  return mesh;
}

/**
 * Un demi-ciseau dans son repère local : Y le long de la lame depuis le pivot, Z la normale des
 * lames (l'axe d'articulation), X la largeur. `edgeSign` dit de quel côté se trouve l'autre lame,
 * donc où poser l'arête de coupe : +1 pour la lame A, −1 pour la lame B, puisque les deux tournent
 * en sens opposé autour de Z.
 */
function buildHalf(name: string, edgeSign: 1 | -1): Group {
  const group = new Group();
  group.name = name;
  const middle = BLADE_LENGTH_CM / 2;
  const blade = part(new Mesh(new BoxGeometry(BLADE_WIDTH_CM, BLADE_LENGTH_CM, BLADE_THICKNESS_CM), steelMaterial), `${name}-blade`, SPECTATOR_LAYER);
  blade.position.set(0, middle, 0);
  const edge = part(new Mesh(new BoxGeometry(EDGE_WIDTH_CM, BLADE_LENGTH_CM, EDGE_THICKNESS_CM), edgeMaterial), `${name}-edge`, SPECTATOR_LAYER);
  edge.position.set((edgeSign * (BLADE_WIDTH_CM - EDGE_WIDTH_CM)) / 2, middle, 0);
  const rim = part(new Mesh(new BoxGeometry(RIM_WIDTH_CM, BLADE_LENGTH_CM * 0.96, RIM_THICKNESS_CM), rimMaterial), `${name}-rim`, SPECTATOR_LAYER);
  rim.position.set((-edgeSign * (BLADE_WIDTH_CM - RIM_WIDTH_CM)) / 2, middle, 0);
  // Le tore est dans le plan XY local, donc dans le plan des lames : l'anneau s'ouvre avec sa lame.
  const handle = part(new Mesh(new TorusGeometry(HANDLE_RADIUS_CM, HANDLE_TUBE_CM, 8, 20), handleMaterial), `${name}-handle`, SPECTATOR_LAYER);
  handle.position.set(0, -HANDLE_BACK_CM, 0);
  group.add(blade, edge, rim, handle);
  return group;
}

/** Oriente un objet : son Y local suit `axisCm`, son Z local suit `normalCm` (monde, cm). */
function orient(object: Group | Mesh, fromCm: Vec3, toCm: Vec3, normalCm: Vec3): void {
  const a = worldToThree(fromCm);
  const y = new Vector3().subVectors(worldToThree(toCm), a);
  if (y.lengthSq() <= 1e-12) return;
  y.normalize();
  const z = worldToThree(normalCm).normalize();
  const x = new Vector3().crossVectors(y, z).normalize();
  object.position.copy(a);
  object.quaternion.setFromRotationMatrix(new Matrix4().makeBasis(x, y, z));
}

/** Comme `orient`, mais l'objet est centré entre les deux points et étiré à leur distance (schéma). */
function placeSchematic(mesh: Mesh, fromCm: Vec3, toCm: Vec3, normalCm: Vec3): void {
  const a = worldToThree(fromCm);
  const y = new Vector3().subVectors(worldToThree(toCm), a);
  const length = y.length();
  if (length <= 1e-6) return;
  orient(mesh, fromCm, toCm, normalCm);
  mesh.scale.set(1, length, 1);
  mesh.position.copy(a).addScaledVector(y.normalize(), length / 2);
}

export interface ScissorsMesh {
  group: Group;
  pose(points: ScissorsPoints): void;
}

export function buildScissorsMesh(): ScissorsMesh {
  const group = new Group();
  group.name = SCISSORS_PART_NAMES.group;
  const halfA = buildHalf(SCISSORS_PART_NAMES.halfA, 1);
  const halfB = buildHalf(SCISSORS_PART_NAMES.halfB, -1);
  const pivot = part(
    new Mesh(new CylinderGeometry(PIVOT_RADIUS_CM, PIVOT_RADIUS_CM, PIVOT_LENGTH_CM, 16), handleMaterial),
    SCISSORS_PART_NAMES.pivot,
    SPECTATOR_LAYER,
  );
  const schematicA = part(new Mesh(new BoxGeometry(SCHEMATIC_WIDTH_CM, 1, SCHEMATIC_THICKNESS_CM), schematicMaterial), 'scissors-agent-blade-a', AGENT_LAYER);
  const schematicB = part(new Mesh(new BoxGeometry(SCHEMATIC_WIDTH_CM, 1, SCHEMATIC_THICKNESS_CM), schematicMaterial), 'scissors-agent-blade-b', AGENT_LAYER);
  group.add(halfA, halfB, pivot, schematicA, schematicB);
  return {
    group,
    pose(points) {
      orient(halfA, points.pivotCm, points.tipACm, points.bladeNormal);
      orient(halfB, points.pivotCm, points.tipBCm, points.bladeNormal);
      // Le cylindre du pivot est porté par son Y local : on le fait suivre la normale des lames.
      pivot.position.copy(worldToThree(points.pivotCm));
      pivot.quaternion.setFromUnitVectors(UP, worldToThree(points.bladeNormal).normalize());
      placeSchematic(schematicA, points.pivotCm, points.tipACm, points.bladeNormal);
      placeSchematic(schematicB, points.pivotCm, points.tipBCm, points.bladeNormal);
    },
  };
}
