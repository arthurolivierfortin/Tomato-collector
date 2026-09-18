import { degToRad, vadd, vnorm, vscale, type Vec3 } from '@tomato/shared';
import { between, createRng, intBetween } from './random';

export interface BranchSpec {
  /** Point d'attache sur la tige principale. */
  fromCm: Vec3;
  /** Point de contrôle (Bézier quadratique) : la branche s'arque au-dessus de sa corde. */
  midCm: Vec3;
  /** Extrémité de la branche. */
  toCm: Vec3;
}

export interface LeafSpec {
  positionCm: Vec3;
  /** Normale du plan de la feuille (unitaire). */
  normal: Vec3;
  sizeCm: number;
  /** Rotation de la feuille autour de sa normale. */
  spinDeg: number;
}

export interface TomatoSpec {
  id: number;
  /** Attache du pédoncule sur la branche. */
  anchorCm: Vec3;
  /** Centre du fruit. */
  centerCm: Vec3;
  radiusCm: number;
  /** Instant (s) où le fruit devient mûr, relatif à la création du plant. */
  ripenAtS: number;
}

export interface PlantSpec {
  seed: number;
  /** Polyligne de la tige principale, du sol vers le haut. */
  mainStem: Vec3[];
  stemRadiusCm: number;
  branches: BranchSpec[];
  leaves: LeafSpec[];
  tomatoes: TomatoSpec[];
}

export interface PlantOptions {
  /** Écart entre deux maturités successives, en secondes sim. */
  ripenIntervalS?: number;
}

const STEM_SEGMENTS = 8;

/** Point de la branche courbe à t ∈ [0, 1] (Bézier quadratique from → mid → to). */
export function branchPoint(b: BranchSpec, t: number): Vec3 {
  const u = 1 - t;
  return vadd(vadd(vscale(b.fromCm, u * u), vscale(b.midCm, 2 * u * t)), vscale(b.toCm, t * t));
}

function unitFromAngles(tiltRad: number, azRad: number, zSign: 1 | -1): Vec3 {
  return vnorm([Math.sin(tiltRad) * Math.cos(azRad), Math.sin(tiltRad) * Math.sin(azRad), zSign * Math.cos(tiltRad)]);
}

function leafletsAt(rng: () => number, nodeCm: Vec3): LeafSpec[] {
  const count = intBetween(rng, 2, 3);
  const leaflets: LeafSpec[] = [];
  for (let i = 0; i < count; i++) {
    const az = degToRad(between(rng, 0, 360));
    const offset = between(rng, 1.5, 4);
    leaflets.push({
      positionCm: vadd(nodeCm, [Math.cos(az) * offset, Math.sin(az) * offset, between(rng, -1, 1)]),
      normal: unitFromAngles(degToRad(between(rng, 10, 45)), degToRad(between(rng, 0, 360)), 1),
      sizeCm: between(rng, 8, 14),
      spinDeg: between(rng, 0, 360),
    });
  }
  return leaflets;
}

export function generatePlant(seed: number, options: PlantOptions = {}): PlantSpec {
  const rng = createRng(seed);
  const ripenIntervalS = options.ripenIntervalS ?? 20;

  const height = between(rng, 60, 80);
  const mainStem: Vec3[] = [[0, 0, 0]];
  let x = 0;
  let y = 0;
  for (let i = 1; i <= STEM_SEGMENTS; i++) {
    x += between(rng, -1.5, 1.5);
    y += between(rng, -1.5, 1.5);
    mainStem.push([x, y, (height * i) / STEM_SEGMENTS]);
  }

  const branchCount = intBetween(rng, 3, 5);
  const branches: BranchSpec[] = [];
  for (let i = 0; i < branchCount; i++) {
    const z = between(rng, 20, height - 8);
    const idx = Math.min(STEM_SEGMENTS, Math.max(1, Math.round((z / height) * STEM_SEGMENTS)));
    const base = mainStem[idx]!;
    const from: Vec3 = [base[0], base[1], z];
    const azimuth = degToRad(between(rng, 0, 360));
    const length = between(rng, 18, 30);
    const droop = between(rng, -4, 6);
    const to: Vec3 = [from[0] + Math.cos(azimuth) * length, from[1] + Math.sin(azimuth) * length, from[2] + droop];
    const mid: Vec3 = vadd(vscale(vadd(from, to), 0.5), [0, 0, between(rng, 3, 8)]);
    branches.push({ fromCm: from, midCm: mid, toCm: to });
  }

  const leaves: LeafSpec[] = [];
  for (const b of branches) {
    const nodes = intBetween(rng, 3, 5);
    for (let i = 0; i < nodes; i++) leaves.push(...leafletsAt(rng, branchPoint(b, between(rng, 0.25, 1))));
  }

  const tomatoCount = intBetween(rng, 4, 8);
  const tomatoes: TomatoSpec[] = [];
  const order = Array.from({ length: tomatoCount }, (_, i) => i).sort(() => rng() - 0.5);
  for (let i = 0; i < tomatoCount; i++) {
    const b = branches[i % branches.length]!;
    const anchor = branchPoint(b, between(rng, 0.3, 0.95));
    // 7 à 9 cm : le fruit mûr grossit ×1,2, il doit rester du pédoncule libre à couper (voir ripening.ts).
    const pedicel = between(rng, 7, 9);
    const dir = unitFromAngles(degToRad(between(rng, 0, 60)), degToRad(between(rng, 0, 360)), -1);
    tomatoes.push({
      id: i + 1,
      anchorCm: anchor,
      centerCm: vadd(anchor, vscale(dir, pedicel)),
      radiusCm: between(rng, 2.5, 3.5),
      ripenAtS: order[i]! * ripenIntervalS + ripenIntervalS / 2,
    });
  }

  return { seed, mainStem, stemRadiusCm: 1.1, branches, leaves, tomatoes };
}
