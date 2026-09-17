import { degToRad, vadd, vlen, vnorm, vscale, vsub, type Vec3 } from '@tomato/shared';
import { between, createRng, intBetween } from './random';

export interface BranchSpec {
  /** Point d'attache sur la tige principale. */
  fromCm: Vec3;
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
  /** Instant sim (s) où le fruit devient mûr. */
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
    branches.push({ fromCm: from, toCm: to });
  }

  const leaves: LeafSpec[] = [];
  for (const b of branches) {
    const axis = vsub(b.toCm, b.fromCm);
    const branchLen = vlen(axis);
    const n = intBetween(rng, 2, 4);
    for (let i = 0; i < n; i++) {
      const t = between(rng, 0.35, 1);
      const pos = vadd(b.fromCm, vscale(vnorm(axis), t * branchLen));
      const tilt = degToRad(between(rng, 10, 45));
      const az = degToRad(between(rng, 0, 360));
      leaves.push({
        positionCm: pos,
        normal: vnorm([Math.sin(tilt) * Math.cos(az), Math.sin(tilt) * Math.sin(az), Math.cos(tilt)]),
        sizeCm: between(rng, 8, 14),
        spinDeg: between(rng, 0, 360),
      });
    }
  }

  const tomatoCount = intBetween(rng, 4, 8);
  const tomatoes: TomatoSpec[] = [];
  const order = Array.from({ length: tomatoCount }, (_, i) => i).sort(() => rng() - 0.5);
  for (let i = 0; i < tomatoCount; i++) {
    const b = branches[i % branches.length]!;
    const t = between(rng, 0.3, 0.95);
    const anchor: Vec3 = vadd(b.fromCm, vscale(vsub(b.toCm, b.fromCm), t));
    const pedicel = between(rng, 4, 6);
    const tilt = degToRad(between(rng, 0, 60));
    const az = degToRad(between(rng, 0, 360));
    const dir: Vec3 = [Math.sin(tilt) * Math.cos(az), Math.sin(tilt) * Math.sin(az), -Math.cos(tilt)];
    tomatoes.push({
      id: i + 1,
      anchorCm: anchor,
      centerCm: vadd(anchor, vscale(dir, pedicel)),
      radiusCm: between(rng, 2.5, 3.5),
      ripenAtS: (order[i]! + 1) * ripenIntervalS,
    });
  }

  return { seed, mainStem, stemRadiusCm: 1.1, branches, leaves, tomatoes };
}
