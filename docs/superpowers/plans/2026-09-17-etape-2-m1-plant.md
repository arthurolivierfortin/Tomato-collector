# Étape 2 — M1 Plant complet : plan d'implémentation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Transformer le plant statique de l'Étape 1 en module `plantModule` : le plant mûrit en temps sim (couleur et rayon), `ripen_next` et `new_plant` sont pris en charge, une tomate coupée (signal `tomato_cut` de M2) tombe sous Rapier, le capteur du panier décide `in_basket` ou `floor`, et l'événement `tomato_landed` est émis exactement une fois par tomate coupée. Le plant v2 est plus dense (branches courbes, 2 à 3 folioles par nœud de feuille) sans casser les invariants du test existant.

**Architecture:** Un module = un dossier `packages/sim/src/plant/`. Trois couches : (1) fonctions pures testées en Node (`ripening.ts`, `landing.ts`, `plantState.ts`, `generatePlant.ts`) ; (2) une interface `PlantPhysics` avec deux implémentations, un faux moteur analytique pour les tests (`fakePhysics.ts`) et Rapier dans le navigateur (`rapierPhysics.ts`, chargé par `import()` dynamique pour ne jamais tirer le WASM dans Vitest) ; (3) une vue Three (`plantView.ts`) qui synchronise couleur, échelle et position des maillages depuis le store. `plantModule.ts` orchestre les trois et n'accède à Three/Rapier que via ces interfaces, ce qui permet de tester en Node toute la logique de mûrissement, d'actions, de chute et d'événements avec le faux moteur.

**Tech Stack:** TypeScript 5 strict, Vitest 3 (Node), Three.js 0.186, `@dimforge/rapier3d-compat` 0.20 (WASM inliné en base64, aucune compilation native), Playwright pour la capture.

**Spec:** `docs/superpowers/specs/2026-09-17-tomato-harvest-demo-design.md` (sections 4.1, 8, 9) et contrat inter-modules `docs/superpowers/plans/2026-09-17-etape-2-architecture.md` (sections « Store », « Registry et signaux », « Chute (M1) », « Mûrissement (M1) »).

**Issue :** #1 — branche `feat/1-m1-plant`, worktree `C:/Tomato-collector/.worktrees/m1-plant`.

## Global Constraints

- Windows 11 sans toolchain native : uniquement Node 22, npm, TypeScript, WASM. Pas de compilation C++ (donc `@dimforge/rapier3d-compat`, jamais `rapier3d` avec plugin wasm ni dépendance native).
- Unités partout : centimètres et degrés. Repère monde : X vers la droite, Y vers l'arrière (profondeur), Z vers le haut, origine au pied du plant.
- Dans Three.js : 1 unité = 1 cm. Conversion monde → Three : `(x, y, z) → (x, z, -y)` via `three/frame.ts` uniquement. Rapier travaille dans le repère Three (gravité `{ x: 0, y: -981, z: 0 }` cm/s²).
- TypeScript strict avec `exactOptionalPropertyTypes` et `noUncheckedIndexedAccess` (un accès indexé renvoie `T | undefined` : utiliser `!` ou une garde comme le code existant). ESLint `consistent-type-imports` : `import type` pour tout ce qui n'est qu'un type. Pas de `any`.
- Jamais de `throw` vers l'agent : `ok` / `fail` de `@tomato/shared`. `packages/shared` est figé : ne pas le modifier.
- Fichiers < 200 lignes ; découper sinon.
- M1 n'écrit dans le store que `seed`, `tomatoes[]` (hors `visibleIn`, qui appartient à M3 et doit être préservé) et `targetTomatoId` (remis à `null` sur `new_plant`). M1 ne touche jamais `scissors`, `basket`, `cameras`, `phase`.
- M1 ne modifie dans `App.tsx` que la ligne `MODULES` et supprime le plant statique. M1 modifie aussi `packages/sim/tests/scene.spec.ts` pour attendre le plant asynchrone (déclaré dans la checklist, item `[SPEC-10]`).
- Gates par PR : `npm run lint`, `npm run typecheck`, `npm test`, `npm run build`, `npm run shot`.
- Tout passe par PR : rebase merge, jamais de push direct sur `main`.

---

## Structure de fichiers

```
packages/sim/package.json                 + dépendance @dimforge/rapier3d-compat
packages/sim/src/App.tsx                  MODULES = [plantModule], plus de plant statique
packages/sim/tests/scene.spec.ts          attend registry.plantSpec avant la capture

packages/sim/src/plant/
  random.ts, random.test.ts               (existant, inchangé)
  generatePlant.ts                        v2 : BranchSpec.midCm, branchPoint(), feuilles en folioles
  generatePlant.test.ts                   (existant, invariants conservés) + tests v2
  ripening.ts, ripening.test.ts           pur : ripenessAt, stateFromRipeness, radiusScale
  landing.ts, landing.test.ts             pur : landingOutcome, shouldDecide
  plantState.ts, plantState.test.ts       pur : tomatoesFromSpec (règle stem), refreshTomato, nextToRipen
  physics.ts                              interface PlantPhysics (aucune implémentation)
  fakePhysics.ts, fakePhysics.test.ts     moteur analytique pour les tests Node
  rapierPhysics.ts                        implémentation Rapier (navigateur seulement, import() dynamique)
  plantView.ts                            Three : groupe du plant, sync couleur/échelle/position
  buildPlantMesh.ts                       branches courbes (tube Bézier), pédoncules nommés pedicel-<id>
  leafTexture.ts                          (existant, inchangé)
  plantModule.ts, plantModule.test.ts     SimModule : init, update, handle, signal tomato_cut
```

Ordre des tâches : 1 dépendance et mûrissement pur → 2 atterrissage pur → 3 état des tomates pur → 4 interface physique et faux moteur → 5 module (init, mûrissement, actions) → 6 module (chute, événement) → 7 plant v2 → 8 maillage v2 et vue Three → 9 Rapier → 10 branchement `App.tsx` et capture → 11 gates, shot, PR.

---

### Task 1: Dépendance Rapier et mûrissement pur

**Files:**
- Modify: `packages/sim/package.json`
- Create: `packages/sim/src/plant/ripening.ts`, `packages/sim/src/plant/ripening.test.ts`

**Interfaces:**
- Consumes: `TomatoState` de `@tomato/shared`.
- Produces:
  - `RIPEN_DURATION_S = 15`, `RADIUS_GROWTH = 0.3`
  - `ripenessAt(ripenAtS: number, simTimeS: number): number` — `clamp((t − (ripenAtS − 15)) / 15, 0, 1)`
  - `stateFromRipeness(ripeness: number): TomatoState` — `< 0.35` `unripe`, `< 0.9` `turning`, sinon `ripe`
  - `radiusScale(ripeness: number): number` — `1 + 0.3 · ripeness`

- [ ] **Step 1: Ajouter la dépendance**

Run: `cd C:/Tomato-collector/.worktrees/m1-plant && npm install @dimforge/rapier3d-compat@^0.20.0 -w @tomato/sim`
Expected: `packages/sim/package.json` contient `"@dimforge/rapier3d-compat": "^0.20.0"` dans `dependencies` ; `package-lock.json` mis à jour ; aucune dépendance native.

- [ ] **Step 2: Test du mûrissement (échoue)**

`packages/sim/src/plant/ripening.test.ts` :

```ts
import { describe, expect, it } from 'vitest';
import { RADIUS_GROWTH, RIPEN_DURATION_S, radiusScale, ripenessAt, stateFromRipeness } from './ripening';

describe('ripenessAt', () => {
  it('is 0 before the 15 s ramp, 1 at ripenAtS and clamped after', () => {
    expect(RIPEN_DURATION_S).toBe(15);
    expect(ripenessAt(40, 0)).toBe(0);
    expect(ripenessAt(40, 25)).toBe(0);
    expect(ripenessAt(40, 32.5)).toBeCloseTo(0.5);
    expect(ripenessAt(40, 40)).toBe(1);
    expect(ripenessAt(40, 100)).toBe(1);
  });

  it('is 1 immediately when ripenAtS equals the current time (ripen_next)', () => {
    expect(ripenessAt(12.3, 12.3)).toBe(1);
  });
});

describe('stateFromRipeness', () => {
  it('maps the thresholds of the contract', () => {
    expect(stateFromRipeness(0)).toBe('unripe');
    expect(stateFromRipeness(0.349)).toBe('unripe');
    expect(stateFromRipeness(0.35)).toBe('turning');
    expect(stateFromRipeness(0.899)).toBe('turning');
    expect(stateFromRipeness(0.9)).toBe('ripe');
    expect(stateFromRipeness(1)).toBe('ripe');
  });
});

describe('radiusScale', () => {
  it('grows the radius linearly from ×1.0 to ×1.3', () => {
    expect(RADIUS_GROWTH).toBe(0.3);
    expect(radiusScale(0)).toBe(1);
    expect(radiusScale(0.5)).toBeCloseTo(1.15);
    expect(radiusScale(1)).toBeCloseTo(1.3);
  });
});
```

Run: `npx vitest run packages/sim/src/plant/ripening.test.ts`
Expected: FAIL — `Cannot find module './ripening'`.

- [ ] **Step 3: Implémentation**

`packages/sim/src/plant/ripening.ts` :

```ts
import type { TomatoState } from '@tomato/shared';

/** Durée de la rampe vert → rouge avant l'instant de maturité, en secondes sim. */
export const RIPEN_DURATION_S = 15;
/** Le rayon du fruit passe de ×1.0 (vert) à ×(1 + RADIUS_GROWTH) (mûr). */
export const RADIUS_GROWTH = 0.3;

const TURNING_AT = 0.35;
const RIPE_AT = 0.9;

/** Maturité 0..1 d'un fruit dont l'instant de maturité est ripenAtS, à l'instant simTimeS. */
export function ripenessAt(ripenAtS: number, simTimeS: number): number {
  const r = (simTimeS - (ripenAtS - RIPEN_DURATION_S)) / RIPEN_DURATION_S;
  return Math.min(1, Math.max(0, r));
}

export function stateFromRipeness(ripeness: number): TomatoState {
  if (ripeness < TURNING_AT) return 'unripe';
  if (ripeness < RIPE_AT) return 'turning';
  return 'ripe';
}

export function radiusScale(ripeness: number): number {
  return 1 + RADIUS_GROWTH * ripeness;
}
```

Run: `npx vitest run packages/sim/src/plant/ripening.test.ts`
Expected: PASS, 4 tests.

- [ ] **Step 4: Commit**

```bash
git add packages/sim/package.json package-lock.json packages/sim/src/plant/ripening.ts packages/sim/src/plant/ripening.test.ts
git commit -m "feat(plant): dépendance Rapier et règles pures de mûrissement (ripenessAt, stateFromRipeness, radiusScale)"
```

---

### Task 2: Règle d'atterrissage pure

**Files:**
- Create: `packages/sim/src/plant/landing.ts`, `packages/sim/src/plant/landing.test.ts`

**Interfaces:**
- Consumes: `BasketPose`, `Vec3` de `@tomato/shared`.
- Produces:
  - `type LandingOutcome = 'in_basket' | 'floor' | 'airborne'`
  - `REST_SPEED_CM_S = 2`, `LANDING_TIMEOUT_S = 3`, `MIN_AIRBORNE_S = 0.25`, `FLOOR_MARGIN_CM = 0.5`
  - `landingOutcome(posCm: Vec3, radiusCm: number, basket: BasketPose): LandingOutcome`
  - `shouldDecide(speedCmS: number, airborneS: number): boolean` — au repos (vitesse < 2 cm/s après au moins 0,25 s de chute, pour ne pas décider à la frame où la vitesse est encore nulle) ou après 3 s sim.

- [ ] **Step 1: Test (échoue)**

`packages/sim/src/plant/landing.test.ts` :

```ts
import { describe, expect, it } from 'vitest';
import type { BasketPose } from '@tomato/shared';
import { LANDING_TIMEOUT_S, REST_SPEED_CM_S, landingOutcome, shouldDecide } from './landing';

const basket: BasketPose = { centerCm: [10, -5, 5], sizeCm: [20, 20], depthCm: 10 };

describe('landingOutcome', () => {
  it('is in_basket when XY is inside the rectangle and Z between the floor and floor + depth + radius', () => {
    expect(landingOutcome([10, -5, 8], 3, basket)).toBe('in_basket');
    expect(landingOutcome([19.9, 4.9, 5], 3, basket)).toBe('in_basket');
    expect(landingOutcome([0.1, -14.9, 18], 3, basket)).toBe('in_basket');
  });

  it('is airborne above the basket or below its floor', () => {
    expect(landingOutcome([10, -5, 18.1], 3, basket)).toBe('airborne');
    expect(landingOutcome([10, -5, 4.9], 3, basket)).toBe('airborne');
  });

  it('is floor when Z <= radius + 0.5 outside the basket', () => {
    expect(landingOutcome([40, 0, 3], 3, basket)).toBe('floor');
    expect(landingOutcome([40, 0, 3.5], 3, basket)).toBe('floor');
    expect(landingOutcome([-30, 30, 3.51], 3, basket)).toBe('airborne');
  });

  it('is airborne while falling outside the basket', () => {
    expect(landingOutcome([40, 0, 30], 3, basket)).toBe('airborne');
  });
});

describe('shouldDecide', () => {
  it('decides at rest only after the minimum airborne time', () => {
    expect(REST_SPEED_CM_S).toBe(2);
    expect(shouldDecide(0, 0)).toBe(false);
    expect(shouldDecide(0, 0.1)).toBe(false);
    expect(shouldDecide(1.9, 0.3)).toBe(true);
    expect(shouldDecide(2, 0.3)).toBe(false);
  });

  it('decides after the 3 s timeout whatever the speed', () => {
    expect(LANDING_TIMEOUT_S).toBe(3);
    expect(shouldDecide(50, 2.99)).toBe(false);
    expect(shouldDecide(50, 3)).toBe(true);
  });
});
```

Run: `npx vitest run packages/sim/src/plant/landing.test.ts`
Expected: FAIL — `Cannot find module './landing'`.

- [ ] **Step 2: Implémentation**

`packages/sim/src/plant/landing.ts` :

```ts
import type { BasketPose, Vec3 } from '@tomato/shared';

export type LandingOutcome = 'in_basket' | 'floor' | 'airborne';

/** En dessous de cette vitesse la tomate est considérée au repos. */
export const REST_SPEED_CM_S = 2;
/** Délai maximal après la coupe avant de décider quoi qu'il arrive. */
export const LANDING_TIMEOUT_S = 3;
/** Temps de chute minimal avant d'accepter une décision « au repos » (la vitesse est nulle à la frame de la coupe). */
export const MIN_AIRBORNE_S = 0.25;
/** Marge au-dessus du sol pour déclarer un contact sol. */
export const FLOOR_MARGIN_CM = 0.5;

/** Règle pure du contrat : où est le centre du fruit par rapport au panier et au sol. */
export function landingOutcome(posCm: Vec3, radiusCm: number, basket: BasketPose): LandingOutcome {
  const [x, y, z] = posCm;
  const [cx, cy, floorZ] = basket.centerCm;
  const [w, d] = basket.sizeCm;
  const insideXY = Math.abs(x - cx) <= w / 2 && Math.abs(y - cy) <= d / 2;
  if (insideXY && z >= floorZ && z <= floorZ + basket.depthCm + radiusCm) return 'in_basket';
  if (!insideXY && z <= radiusCm + FLOOR_MARGIN_CM) return 'floor';
  return 'airborne';
}

/** Décision au repos (après un temps de chute minimal) ou après le délai. */
export function shouldDecide(speedCmS: number, airborneS: number): boolean {
  if (airborneS >= LANDING_TIMEOUT_S) return true;
  return airborneS >= MIN_AIRBORNE_S && speedCmS < REST_SPEED_CM_S;
}
```

Run: `npx vitest run packages/sim/src/plant/landing.test.ts`
Expected: PASS, 6 tests.

- [ ] **Step 3: Commit**

```bash
git add packages/sim/src/plant/landing.ts packages/sim/src/plant/landing.test.ts
git commit -m "feat(plant): règle d'atterrissage pure landingOutcome et critère de décision shouldDecide"
```

---
### Task 3: État des tomates dans le store (règle du pédoncule, rafraîchissement, prochaine à mûrir)

**Files:**
- Create: `packages/sim/src/plant/plantState.ts`, `packages/sim/src/plant/plantState.test.ts`

**Interfaces:**
- Consumes: `Tomato`, `Vec3`, `vnorm`, `vscale`, `vsub` de `@tomato/shared` ; `PlantSpec`, `TomatoSpec` de `./generatePlant` ; `ripenessAt`, `stateFromRipeness`, `radiusScale` de `./ripening`.
- Produces:
  - `stemOf(t: TomatoSpec): { fromCm: Vec3; toCm: Vec3 }` — `fromCm = anchorCm`, `toCm = centerCm − dir · radiusCm` avec `dir = norm(centerCm − anchorCm)` (règle du contrat, lue par M2 et M3).
  - `tomatoFromSpec(t: TomatoSpec, ripenAtS: number, simTimeS: number): Tomato` — `attached: true`, `visibleIn` à 1 partout (M3 le recalculera).
  - `tomatoesFromSpec(spec: PlantSpec, simTimeS: number): Tomato[]`
  - `ripenTomato(tomato: Tomato, spec: TomatoSpec, ripenAtS: number, simTimeS: number): Tomato` — ne touche que `ripeness`, `state`, `radiusCm` (préserve `visibleIn`, `positionCm`, `attached`).
  - `nextToRipen(tomatoes: readonly Tomato[], ripenAt: ReadonlyMap<number, number>): number | null` — la tomate attachée non `ripe` dont l'instant de maturité est le plus proche.

- [ ] **Step 1: Test (échoue)**

`packages/sim/src/plant/plantState.test.ts` :

```ts
import { describe, expect, it } from 'vitest';
import type { PlantSpec } from './generatePlant';
import { nextToRipen, ripenTomato, stemOf, tomatoesFromSpec } from './plantState';

const spec: PlantSpec = {
  seed: 1,
  mainStem: [[0, 0, 0], [0, 0, 70]],
  stemRadiusCm: 1.1,
  branches: [],
  leaves: [],
  tomatoes: [
    { id: 1, anchorCm: [10, 0, 50], centerCm: [10, 0, 45], radiusCm: 3, ripenAtS: 20 },
    { id: 2, anchorCm: [-10, 5, 40], centerCm: [-13, 5, 36], radiusCm: 2.5, ripenAtS: 40 },
  ],
};

describe('stemOf', () => {
  it('goes from the anchor to the surface of the fruit along the pedicel direction', () => {
    expect(stemOf(spec.tomatoes[0]!)).toEqual({ fromCm: [10, 0, 50], toCm: [10, 0, 48] });
    const s = stemOf(spec.tomatoes[1]!);
    expect(s.fromCm).toEqual([-10, 5, 40]);
    expect(s.toCm[0]).toBeCloseTo(-11.5);
    expect(s.toCm[1]).toBeCloseTo(5);
    expect(s.toCm[2]).toBeCloseTo(38);
  });
});

describe('tomatoesFromSpec', () => {
  it('fills every store field of the contract at t = 0', () => {
    const ts = tomatoesFromSpec(spec, 0);
    expect(ts.map((t) => t.id)).toEqual([1, 2]);
    const t1 = ts[0]!;
    expect(t1.positionCm).toEqual([10, 0, 45]);
    expect(t1.radiusCm).toBe(3);
    expect(t1.ripeness).toBe(0);
    expect(t1.state).toBe('unripe');
    expect(t1.attached).toBe(true);
    expect(t1.stem).toEqual({ fromCm: [10, 0, 50], toCm: [10, 0, 48] });
    expect(t1.visibleIn).toEqual({ top: 1, front: 1, side: 1 });
  });

  it('is ripe with radius ×1.3 once past ripenAtS', () => {
    const t1 = tomatoesFromSpec(spec, 20)[0]!;
    expect(t1.state).toBe('ripe');
    expect(t1.ripeness).toBe(1);
    expect(t1.radiusCm).toBeCloseTo(3.9);
  });
});

describe('ripenTomato', () => {
  it('updates ripeness, state and radius and preserves the other fields', () => {
    const before = { ...tomatoesFromSpec(spec, 0)[0]!, visibleIn: { top: 0.42, front: 1, side: 0 }, positionCm: [1, 2, 3] as const };
    const after = ripenTomato(before, spec.tomatoes[0]!, 20, 12.5);
    expect(after.ripeness).toBeCloseTo(0.5);
    expect(after.state).toBe('turning');
    expect(after.radiusCm).toBeCloseTo(3.45);
    expect(after.visibleIn).toEqual({ top: 0.42, front: 1, side: 0 });
    expect(after.positionCm).toEqual([1, 2, 3]);
    expect(after.attached).toBe(true);
  });
});

describe('nextToRipen', () => {
  const ripenAt = new Map([[1, 20], [2, 40]]);

  it('picks the attached unripe tomato with the earliest ripenAtS', () => {
    expect(nextToRipen(tomatoesFromSpec(spec, 0), ripenAt)).toBe(1);
  });

  it('skips ripe and detached tomatoes, null when none is left', () => {
    const ts = tomatoesFromSpec(spec, 20);
    expect(nextToRipen(ts, ripenAt)).toBe(2);
    const detached = ts.map((t) => (t.id === 2 ? { ...t, attached: false } : t));
    expect(nextToRipen(detached, ripenAt)).toBeNull();
  });
});
```

Run: `npx vitest run packages/sim/src/plant/plantState.test.ts`
Expected: FAIL — `Cannot find module './plantState'`.

- [ ] **Step 2: Implémentation**

`packages/sim/src/plant/plantState.ts` :

```ts
import { vnorm, vscale, vsub } from '@tomato/shared';
import type { Tomato, Vec3 } from '@tomato/shared';
import type { PlantSpec, TomatoSpec } from './generatePlant';
import { radiusScale, ripenessAt, stateFromRipeness } from './ripening';

/** Pédoncule du contrat : de l'attache sur la branche (from) à la surface du fruit (to). */
export function stemOf(t: TomatoSpec): { fromCm: Vec3; toCm: Vec3 } {
  const dir = vnorm(vsub(t.centerCm, t.anchorCm));
  return { fromCm: t.anchorCm, toCm: vsub(t.centerCm, vscale(dir, t.radiusCm)) };
}

export function tomatoFromSpec(t: TomatoSpec, ripenAtS: number, simTimeS: number): Tomato {
  const ripeness = ripenessAt(ripenAtS, simTimeS);
  return {
    id: t.id,
    state: stateFromRipeness(ripeness),
    ripeness,
    positionCm: t.centerCm,
    radiusCm: t.radiusCm * radiusScale(ripeness),
    stem: stemOf(t),
    attached: true,
    visibleIn: { top: 1, front: 1, side: 1 },
  };
}

export function tomatoesFromSpec(spec: PlantSpec, simTimeS: number): Tomato[] {
  return spec.tomatoes.map((t) => tomatoFromSpec(t, t.ripenAtS, simTimeS));
}

/** Recalcule maturité, état et rayon ; ne touche pas aux champs des autres modules (visibleIn) ni à la position. */
export function ripenTomato(tomato: Tomato, spec: TomatoSpec, ripenAtS: number, simTimeS: number): Tomato {
  const ripeness = ripenessAt(ripenAtS, simTimeS);
  return { ...tomato, ripeness, state: stateFromRipeness(ripeness), radiusCm: spec.radiusCm * radiusScale(ripeness) };
}

/** La prochaine tomate attachée et non mûre : celle dont l'instant de maturité est le plus proche. */
export function nextToRipen(tomatoes: readonly Tomato[], ripenAt: ReadonlyMap<number, number>): number | null {
  let best: number | null = null;
  let bestAt = Infinity;
  for (const t of tomatoes) {
    if (!t.attached || t.state === 'ripe') continue;
    const at = ripenAt.get(t.id) ?? Infinity;
    if (at < bestAt) {
      bestAt = at;
      best = t.id;
    }
  }
  return best;
}
```

Run: `npx vitest run packages/sim/src/plant/plantState.test.ts`
Expected: PASS, 6 tests.

- [ ] **Step 3: Commit**

```bash
git add packages/sim/src/plant/plantState.ts packages/sim/src/plant/plantState.test.ts
git commit -m "feat(plant): tomates du store depuis la spec (règle du pédoncule), rafraîchissement, prochaine à mûrir"
```

---

### Task 4: Interface `PlantPhysics` et faux moteur pour les tests

**Files:**
- Create: `packages/sim/src/plant/physics.ts`, `packages/sim/src/plant/fakePhysics.ts`, `packages/sim/src/plant/fakePhysics.test.ts`

**Interfaces:**
- Consumes: `BasketPose`, `Vec3` de `@tomato/shared`.
- Produces:
  - `interface PlantPhysics { attach(id: number, centerCm: Vec3, radiusCm: number): void; release(id: number, radiusCm: number): void; clear(): void; step(dtS: number): void; positionOf(id: number): Vec3 | null; speedOf(id: number): number; setBasket(basket: BasketPose): void; dispose(): void }`
  - `GRAVITY_CM_S2 = 981`
  - `createFakePhysics(): PlantPhysics` — chute verticale analytique : une tomate libérée tombe sous la gravité et s'arrête sur le fond du panier (si son XY est dans le rectangle) ou sur le sol ; une tomate attachée ne bouge pas.

- [ ] **Step 1: Interface**

`packages/sim/src/plant/physics.ts` :

```ts
import type { BasketPose, Vec3 } from '@tomato/shared';

/**
 * Adaptateur physique du plant. Deux implémentations : Rapier dans le navigateur
 * (rapierPhysics.ts) et un moteur analytique pour les tests Node (fakePhysics.ts).
 * Toutes les positions sont en cm dans le repère monde (Z haut).
 */
export interface PlantPhysics {
  /** Crée (ou recrée) le corps cinématique d'une tomate attachée, immobile à sa position monde. */
  attach(id: number, centerCm: Vec3, radiusCm: number): void;
  /** Coupe : le corps devient dynamique avec le rayon courant du fruit et tombe. */
  release(id: number, radiusCm: number): void;
  /** Supprime tous les corps de tomates (nouveau plant). */
  clear(): void;
  /** Avance la physique de dtS secondes sim (0 = rien). */
  step(dtS: number): void;
  /** Position monde du centre du fruit, null si inconnu. */
  positionOf(id: number): Vec3 | null;
  /** Norme de la vitesse en cm/s, 0 si inconnue. */
  speedOf(id: number): number;
  /** Repositionne le panier (fond, parois et capteur) depuis le store ; appelé à chaque frame. */
  setBasket(basket: BasketPose): void;
  dispose(): void;
}
```

- [ ] **Step 2: Test du faux moteur (échoue)**

`packages/sim/src/plant/fakePhysics.test.ts` :

```ts
import { describe, expect, it } from 'vitest';
import type { BasketPose } from '@tomato/shared';
import { createFakePhysics } from './fakePhysics';

const basket: BasketPose = { centerCm: [0, 0, 5], sizeCm: [20, 20], depthCm: 10 };

function settle(physics: { step(dt: number): void }, seconds: number): void {
  for (let i = 0; i < seconds * 100; i++) physics.step(0.01);
}

describe('createFakePhysics', () => {
  it('keeps an attached tomato in place', () => {
    const p = createFakePhysics();
    p.attach(1, [10, 0, 45], 3);
    settle(p, 1);
    expect(p.positionOf(1)).toEqual([10, 0, 45]);
    expect(p.speedOf(1)).toBe(0);
    expect(p.positionOf(99)).toBeNull();
  });

  it('drops a released tomato onto the floor outside the basket', () => {
    const p = createFakePhysics();
    p.setBasket(basket);
    p.attach(1, [40, 0, 45], 3);
    p.release(1, 3.9);
    p.step(0.1);
    expect(p.speedOf(1)).toBeGreaterThan(50);
    settle(p, 1);
    expect(p.positionOf(1)).toEqual([40, 0, 3.9]);
    expect(p.speedOf(1)).toBe(0);
  });

  it('drops a released tomato onto the basket floor when XY is inside', () => {
    const p = createFakePhysics();
    p.setBasket(basket);
    p.attach(2, [5, -5, 45], 3);
    p.release(2, 3);
    settle(p, 1);
    expect(p.positionOf(2)).toEqual([5, -5, 8]);
  });

  it('forgets every body on clear', () => {
    const p = createFakePhysics();
    p.attach(1, [0, 0, 40], 3);
    p.clear();
    expect(p.positionOf(1)).toBeNull();
  });
});
```

Run: `npx vitest run packages/sim/src/plant/fakePhysics.test.ts`
Expected: FAIL — `Cannot find module './fakePhysics'`.

- [ ] **Step 3: Implémentation du faux moteur**

`packages/sim/src/plant/fakePhysics.ts` :

```ts
import type { BasketPose, Vec3 } from '@tomato/shared';
import type { PlantPhysics } from './physics';

export const GRAVITY_CM_S2 = 981;

interface FakeBody {
  pos: [number, number, number];
  radius: number;
  vz: number;
  released: boolean;
}

/** Moteur analytique : chute verticale sous gravité, arrêt sur le fond du panier (XY dedans) ou sur le sol. */
export function createFakePhysics(): PlantPhysics {
  const bodies = new Map<number, FakeBody>();
  let basket: BasketPose | null = null;

  const restZ = (b: FakeBody): number => {
    if (basket) {
      const [cx, cy, floorZ] = basket.centerCm;
      const [w, d] = basket.sizeCm;
      if (Math.abs(b.pos[0] - cx) <= w / 2 && Math.abs(b.pos[1] - cy) <= d / 2) return floorZ + b.radius;
    }
    return b.radius;
  };

  return {
    attach(id, centerCm, radiusCm) {
      bodies.set(id, { pos: [centerCm[0], centerCm[1], centerCm[2]], radius: radiusCm, vz: 0, released: false });
    },
    release(id, radiusCm) {
      const b = bodies.get(id);
      if (!b) return;
      b.radius = radiusCm;
      b.released = true;
    },
    clear: () => bodies.clear(),
    step(dtS) {
      if (dtS <= 0) return;
      for (const b of bodies.values()) {
        if (!b.released) continue;
        b.vz -= GRAVITY_CM_S2 * dtS;
        b.pos[2] += b.vz * dtS;
        const floor = restZ(b);
        if (b.pos[2] <= floor) {
          b.pos[2] = floor;
          b.vz = 0;
        }
      }
    },
    positionOf(id) {
      const b = bodies.get(id);
      return b ? [b.pos[0], b.pos[1], b.pos[2]] : null;
    },
    speedOf: (id) => Math.abs(bodies.get(id)?.vz ?? 0),
    setBasket(next) {
      basket = next;
    },
    dispose: () => bodies.clear(),
  };
}
```

Run: `npx vitest run packages/sim/src/plant/fakePhysics.test.ts`
Expected: PASS, 4 tests.

- [ ] **Step 4: Commit**

```bash
git add packages/sim/src/plant/physics.ts packages/sim/src/plant/fakePhysics.ts packages/sim/src/plant/fakePhysics.test.ts
git commit -m "feat(plant): interface PlantPhysics et faux moteur analytique pour les tests"
```

---
### Task 5: `plantModule` — init, mûrissement, `ripen_next`, `new_plant`

**Files:**
- Create: `packages/sim/src/plant/view.ts` (interface seule), `packages/sim/src/plant/plantModule.ts`, `packages/sim/src/plant/plantModule.test.ts`

**Interfaces:**
- Consumes: `fail`, `ok`, `SimEvent`, `Tomato` de `@tomato/shared` ; `SimContext`, `SimModule` de `../core/module` ; `generatePlant` ; `PlantPhysics`, `createFakePhysics` ; `nextToRipen`, `ripenTomato`, `tomatoesFromSpec`.
- Produces:
  - `interface PlantView { setSpec(spec: PlantSpec): void; sync(tomatoes: readonly Tomato[]): void; dispose(): void }` (`view.ts`, implémenté en Task 8).
  - `interface PlantModuleDeps { createPhysics?: (ctx: SimContext) => Promise<PlantPhysics>; createView?: (ctx: SimContext) => Promise<PlantView | null> }`
  - `createPlantModule(deps?: PlantModuleDeps): SimModule` — par défaut : Rapier + vue Three si `ctx.scene` existe (chargés par `import()` dynamique), sinon faux moteur et pas de vue.
  - `plantModule: SimModule` — l'instance ajoutée à `MODULES` (nom `'plant'`).
  - Comportement : à `init`, `ctx.registry.plantSpec = generatePlant(store.seed)`, `store.tomatoes` rempli, corps cinématiques attachés. À chaque `update(dtSimS > 0)` : panier repositionné, physique avancée, tomates attachées mûries (`ripeness`, `state`, `radiusCm`), tomates détachées suivies en position, vue synchronisée. Les instants de maturité sont relatifs à la création du plant (`ripenAt = simTimeS à la création + spec.ripenAtS`). `ripen_next` : la prochaine attachée non mûre reçoit `ripenAt = simTimeS` ; `not_available` s'il n'en reste pas. `new_plant` : graine `action.seed ?? seed + 1`, tout est régénéré, `targetTomatoId = null`, signal et événement `plant_regenerated`.

- [ ] **Step 1: Interface de la vue**

`packages/sim/src/plant/view.ts` :

```ts
import type { Tomato } from '@tomato/shared';
import type { PlantSpec } from './generatePlant';

/** Vue Three du plant (plantView.ts) ; null dans les tests Node. */
export interface PlantView {
  /** Remplace le plant affiché par celui de la spec. */
  setSpec(spec: PlantSpec): void;
  /** Applique couleur, échelle, position et visibilité du pédoncule depuis le store. */
  sync(tomatoes: readonly Tomato[]): void;
  dispose(): void;
}
```

- [ ] **Step 2: Test du module (échoue)**

`packages/sim/src/plant/plantModule.test.ts` :

```ts
import { describe, expect, it } from 'vitest';
import { createDefaultWorld } from '@tomato/shared';
import type { SimEvent } from '@tomato/shared';
import type { SimContext, SimModule } from '../core/module';
import { createSignals } from '../core/signals';
import { createWorldStore } from '../core/store';
import { createFakePhysics } from './fakePhysics';
import { generatePlant } from './generatePlant';
import { createPlantModule } from './plantModule';

const SEED = 123;

async function setup() {
  const events: SimEvent[] = [];
  const ctx: SimContext = {
    store: createWorldStore(createDefaultWorld(SEED)),
    signals: createSignals(),
    emitEvent: (e) => events.push(e),
    scene: null,
    registry: { plantSpec: null },
  };
  const physics = createFakePhysics();
  const mod = createPlantModule({ createPhysics: () => Promise.resolve(physics), createView: () => Promise.resolve(null) });
  await mod.init(ctx);
  return { ctx, mod, events, physics };
}

/** Avance la sim de `seconds` par pas de 10 ms (horloge simulée à la main : le module reçoit le dt sim). */
function tick(mod: SimModule, ctx: SimContext, seconds: number): void {
  for (let i = 0; i < Math.round(seconds * 100); i++) {
    ctx.store.update((s) => ({ ...s, simTimeS: s.simTimeS + 0.01 }));
    mod.update!(0.01, ctx);
  }
}

describe('plantModule init', () => {
  it('publishes the plant spec and fills the store tomatoes per the contract', async () => {
    const { ctx } = await setup();
    const spec = generatePlant(SEED);
    expect(ctx.registry.plantSpec).toEqual(spec);
    const tomatoes = ctx.store.get().tomatoes;
    expect(tomatoes.map((t) => t.id)).toEqual(spec.tomatoes.map((t) => t.id));
    for (const t of tomatoes) {
      expect(t.attached).toBe(true);
      expect(t.state).toBe('unripe');
      expect(t.ripeness).toBe(0);
      expect(t.visibleIn).toEqual({ top: 1, front: 1, side: 1 });
    }
    const t0 = tomatoes[0]!;
    const s0 = spec.tomatoes[0]!;
    expect(t0.positionCm).toEqual(s0.centerCm);
    expect(t0.stem.fromCm).toEqual(s0.anchorCm);
    expect(Math.hypot(...t0.stem.toCm.map((v, i) => v - s0.centerCm[i]!))).toBeCloseTo(s0.radiusCm);
  });
});

describe('plantModule ripening', () => {
  it('ripens tomatoes with sim time: turning halfway, ripe with radius ×1.3 at ripenAtS', async () => {
    const { ctx, mod } = await setup();
    const spec = generatePlant(SEED);
    const first = [...spec.tomatoes].sort((a, b) => a.ripenAtS - b.ripenAtS)[0]!;
    ctx.store.update((s) => ({ ...s, simTimeS: first.ripenAtS - 7.5 }));
    mod.update!(0.01, ctx);
    let t = ctx.store.get().tomatoes.find((x) => x.id === first.id)!;
    expect(t.state).toBe('turning');
    expect(t.ripeness).toBeCloseTo(0.5);
    ctx.store.update((s) => ({ ...s, simTimeS: first.ripenAtS }));
    mod.update!(0.01, ctx);
    t = ctx.store.get().tomatoes.find((x) => x.id === first.id)!;
    expect(t.state).toBe('ripe');
    expect(t.radiusCm).toBeCloseTo(first.radiusCm * 1.3);
  });

  it('does nothing while paused (dt = 0) and preserves visibleIn written by another module', async () => {
    const { ctx, mod } = await setup();
    ctx.store.update((s) => ({
      ...s,
      tomatoes: s.tomatoes.map((t, i) => (i === 0 ? { ...t, visibleIn: { top: 0.42, front: 1, side: 0 } } : t)),
    }));
    const before = ctx.store.get();
    mod.update!(0, ctx);
    expect(ctx.store.get()).toBe(before);
    tick(mod, ctx, 0.1);
    expect(ctx.store.get().tomatoes[0]!.visibleIn).toEqual({ top: 0.42, front: 1, side: 0 });
  });
});

describe('plantModule actions', () => {
  it('ripen_next ripens the next attached unripe tomato immediately, then fails with not_available', async () => {
    const { ctx, mod } = await setup();
    const spec = generatePlant(SEED);
    const first = [...spec.tomatoes].sort((a, b) => a.ripenAtS - b.ripenAtS)[0]!;
    const r = mod.handle!({ type: 'ripen_next' }, ctx);
    expect(r?.ok).toBe(true);
    expect(r?.message).toContain(`tomato ${first.id}`);
    const ripe = ctx.store.get().tomatoes.filter((t) => t.state === 'ripe');
    expect(ripe.map((t) => t.id)).toEqual([first.id]);
    expect(ripe[0]!.ripeness).toBe(1);
    for (let i = 1; i < spec.tomatoes.length; i++) expect(mod.handle!({ type: 'ripen_next' }, ctx)?.ok).toBe(true);
    const last = mod.handle!({ type: 'ripen_next' }, ctx);
    expect(last?.ok).toBe(false);
    if (!last || last.ok) throw new Error('unreachable');
    expect(last.error).toBe('not_available');
  });

  it('new_plant regenerates everything, resets the target and announces the seed', async () => {
    const { ctx, mod, events } = await setup();
    const signals: number[] = [];
    ctx.signals.on('plant_regenerated', (s) => signals.push(s.seed));
    ctx.store.update((s) => ({ ...s, simTimeS: 100, targetTomatoId: 1 }));
    const r = mod.handle!({ type: 'new_plant', seed: 777 }, ctx);
    expect(r?.ok).toBe(true);
    const s = ctx.store.get();
    expect(s.seed).toBe(777);
    expect(s.targetTomatoId).toBeNull();
    expect(ctx.registry.plantSpec).toEqual(generatePlant(777));
    expect(s.tomatoes.map((t) => t.id)).toEqual(generatePlant(777).tomatoes.map((t) => t.id));
    for (const t of s.tomatoes) expect(t.state).toBe('unripe');
    expect(signals).toEqual([777]);
    expect(events).toEqual([{ type: 'plant_regenerated', seed: 777 }]);
  });

  it('new_plant without a seed picks a different one', async () => {
    const { ctx, mod } = await setup();
    mod.handle!({ type: 'new_plant' }, ctx);
    expect(ctx.store.get().seed).not.toBe(SEED);
  });

  it('ignores actions of other modules', async () => {
    const { ctx, mod } = await setup();
    expect(mod.handle!({ type: 'cut' }, ctx)).toBeNull();
  });
});
```

Run: `npx vitest run packages/sim/src/plant/plantModule.test.ts`
Expected: FAIL — `Cannot find module './plantModule'`.

- [ ] **Step 3: Implémentation du module (v1, sans chute)**

`packages/sim/src/plant/plantModule.ts` :

```ts
import { fail, ok } from '@tomato/shared';
import type { SimContext, SimModule } from '../core/module';
import { createFakePhysics } from './fakePhysics';
import { generatePlant } from './generatePlant';
import type { PlantSpec, TomatoSpec } from './generatePlant';
import type { PlantPhysics } from './physics';
import { nextToRipen, ripenTomato, tomatoesFromSpec } from './plantState';
import type { PlantView } from './view';

export interface PlantModuleDeps {
  createPhysics?: (ctx: SimContext) => Promise<PlantPhysics>;
  createView?: (ctx: SimContext) => Promise<PlantView | null>;
}

async function defaultPhysics(ctx: SimContext): Promise<PlantPhysics> {
  if (!ctx.scene) return createFakePhysics();
  const { createRapierPhysics } = await import('./rapierPhysics');
  return createRapierPhysics();
}

async function defaultView(ctx: SimContext): Promise<PlantView | null> {
  if (!ctx.scene) return null;
  const { createPlantView } = await import('./plantView');
  return createPlantView(ctx.scene);
}

const nextSeed = (seed: number): number => (seed + 1) >>> 0;

export function createPlantModule(deps: PlantModuleDeps = {}): SimModule {
  const specById = new Map<number, TomatoSpec>();
  /** Instant sim de maturité par tomate (relatif à la création du plant, modifié par ripen_next). */
  const ripenAt = new Map<number, number>();
  let physics: PlantPhysics = createFakePhysics();
  let view: PlantView | null = null;

  function loadPlant(ctx: SimContext, seed: number): PlantSpec {
    const spec = generatePlant(seed);
    const simTimeS = ctx.store.get().simTimeS;
    specById.clear();
    ripenAt.clear();
    for (const t of spec.tomatoes) {
      specById.set(t.id, t);
      ripenAt.set(t.id, simTimeS + t.ripenAtS);
    }
    ctx.registry.plantSpec = spec;
    physics.clear();
    const tomatoes = tomatoesFromSpec(spec, 0);
    for (const t of tomatoes) physics.attach(t.id, t.positionCm, t.radiusCm);
    ctx.store.update((s) => ({ ...s, seed, tomatoes, targetTomatoId: null }));
    view?.setSpec(spec);
    view?.sync(tomatoes);
    return spec;
  }

  /** Recalcule les tomates depuis le store (mûrissement des attachées, position des détachées) et pousse la vue. */
  function refresh(ctx: SimContext): void {
    const s = ctx.store.get();
    const tomatoes = s.tomatoes.map((t) => {
      const spec = specById.get(t.id);
      if (!spec) return t;
      if (t.attached) return ripenTomato(t, spec, ripenAt.get(t.id) ?? spec.ripenAtS, s.simTimeS);
      return { ...t, positionCm: physics.positionOf(t.id) ?? t.positionCm };
    });
    ctx.store.update((st) => ({ ...st, tomatoes }));
    view?.sync(tomatoes);
  }

  return {
    name: 'plant',
    async init(ctx) {
      physics = await (deps.createPhysics ?? defaultPhysics)(ctx);
      view = await (deps.createView ?? defaultView)(ctx);
      physics.setBasket(ctx.store.get().basket);
      loadPlant(ctx, ctx.store.get().seed);
    },
    update(dtSimS, ctx) {
      if (dtSimS <= 0) return;
      physics.setBasket(ctx.store.get().basket);
      physics.step(dtSimS);
      refresh(ctx);
    },
    handle(action, ctx) {
      const s = ctx.store.get();
      switch (action.type) {
        case 'ripen_next': {
          const id = nextToRipen(s.tomatoes, ripenAt);
          if (id === null) return fail(s, 'not_available', 'no unripe tomato left on the plant');
          ripenAt.set(id, s.simTimeS);
          refresh(ctx);
          return ok(ctx.store.get(), `tomato ${id} is ripe`);
        }
        case 'new_plant': {
          const seed = action.seed ?? nextSeed(s.seed);
          loadPlant(ctx, seed);
          ctx.signals.emit({ type: 'plant_regenerated', seed });
          ctx.emitEvent({ type: 'plant_regenerated', seed });
          return ok(ctx.store.get(), `new plant with seed ${seed}`);
        }
        default:
          return null;
      }
    },
  };
}

/** Instance ajoutée à MODULES dans App.tsx. */
export const plantModule: SimModule = createPlantModule();
```

Note : `tomatoesFromSpec(spec, 0)` est appelé avec `simTimeS = 0` car les `ripenAtS` de la spec sont relatifs à la création du plant ; le premier `refresh` recalcule avec `ripenAt` absolu. Les `import()` dynamiques de `./rapierPhysics` et `./plantView` ne sont exécutés que dans le navigateur ; `tsc` ne passera qu'après les Tasks 8 et 9 (les fichiers existeront), Vitest passe dès maintenant.

Run: `npx vitest run packages/sim/src/plant/plantModule.test.ts`
Expected: PASS, 7 tests.

- [ ] **Step 4: Commit**

```bash
git add packages/sim/src/plant/view.ts packages/sim/src/plant/plantModule.ts packages/sim/src/plant/plantModule.test.ts
git commit -m "feat(plant): plantModule — spec publiée, tomates du store, mûrissement en temps sim, ripen_next et new_plant"
```

---
### Task 6: Chute, capteur panier et événement `tomato_landed`

**Files:**
- Create: `packages/sim/src/plant/falling.ts`, `packages/sim/src/plant/falling.test.ts`
- Modify: `packages/sim/src/plant/plantModule.ts` (fichier complet ci-dessous), `packages/sim/src/plant/plantModule.test.ts` (bloc ajouté)

**Interfaces:**
- Consumes: `BasketPose`, `Tomato` de `@tomato/shared` ; `landingOutcome`, `shouldDecide` ; `PlantPhysics` ; signal `tomato_cut` de `ctx.signals`.
- Produces:
  - `interface Landed { tomatoId: number; inBasket: boolean }`
  - `interface FallTracker { release(tomato: Tomato): boolean; advance(dtS: number, tomatoes: readonly Tomato[], basket: BasketPose): Landed[]; isFalling(id: number): boolean; reset(): void }`
  - `createFallTracker(physics: PlantPhysics): FallTracker` — `release` libère le corps (dynamique) et démarre le chrono ; `advance` cumule le temps de chute, décide au repos ou au délai par `shouldDecide`, calcule `landingOutcome` sur la position du store et renvoie chaque tomate décidée **une seule fois**.
  - `plantModule` : écoute `tomato_cut`, passe `attached = false`, suit la position de la tomate dans le store et la vue, émet `ctx.emitEvent({ type: 'tomato_landed', tomatoId, inBasket })` exactement une fois ; `new_plant` oublie les chutes en cours.

- [ ] **Step 1: Test du suivi de chute (échoue)**

`packages/sim/src/plant/falling.test.ts` :

```ts
import { describe, expect, it } from 'vitest';
import type { BasketPose, Tomato, Vec3 } from '@tomato/shared';
import { createFakePhysics } from './fakePhysics';
import { createFallTracker } from './falling';
import type { Landed } from './falling';
import type { PlantPhysics } from './physics';

const basket: BasketPose = { centerCm: [0, 0, 5], sizeCm: [20, 20], depthCm: 10 };

function tomato(id: number, positionCm: Vec3): Tomato {
  return {
    id, state: 'ripe', ripeness: 1, positionCm, radiusCm: 3,
    stem: { fromCm: positionCm, toCm: positionCm }, attached: false, visibleIn: { top: 1, front: 1, side: 1 },
  };
}

/** Fait tomber la tomate `id` pendant `seconds` en relisant sa position dans le faux moteur à chaque pas. */
function fall(physics: PlantPhysics, tracker: ReturnType<typeof createFallTracker>, id: number, seconds: number): Landed[] {
  const landed: Landed[] = [];
  for (let i = 0; i < seconds * 100; i++) {
    physics.step(0.01);
    landed.push(...tracker.advance(0.01, [tomato(id, physics.positionOf(id)!)], basket));
  }
  return landed;
}

describe('createFallTracker', () => {
  it('decides in_basket once at rest on the basket floor', () => {
    const physics = createFakePhysics();
    physics.setBasket(basket);
    physics.attach(1, [5, 0, 40], 3);
    const tracker = createFallTracker(physics);
    expect(tracker.release(tomato(1, [5, 0, 40]))).toBe(true);
    expect(tracker.isFalling(1)).toBe(true);
    expect(fall(physics, tracker, 1, 1)).toEqual([{ tomatoId: 1, inBasket: true }]);
    expect(tracker.isFalling(1)).toBe(false);
    expect(fall(physics, tracker, 1, 3)).toEqual([]);
  });

  it('decides floor (inBasket = false) outside the basket', () => {
    const physics = createFakePhysics();
    physics.setBasket(basket);
    physics.attach(2, [40, 0, 40], 3);
    const tracker = createFallTracker(physics);
    tracker.release(tomato(2, [40, 0, 40]));
    expect(fall(physics, tracker, 2, 1)).toEqual([{ tomatoId: 2, inBasket: false }]);
  });

  it('does not decide at the frame of the cut, and refuses a second release', () => {
    const physics = createFakePhysics();
    physics.attach(1, [5, 0, 40], 3);
    const tracker = createFallTracker(physics);
    tracker.release(tomato(1, [5, 0, 40]));
    expect(tracker.advance(0.01, [tomato(1, [5, 0, 40])], basket)).toEqual([]);
    expect(tracker.release(tomato(1, [5, 0, 40]))).toBe(false);
  });

  it('decides after 3 s even if the tomato never rests (airborne → inBasket = false)', () => {
    const never: PlantPhysics = {
      attach: () => undefined, release: () => undefined, clear: () => undefined, step: () => undefined,
      positionOf: () => [0, 0, 60], speedOf: () => 50, setBasket: () => undefined, dispose: () => undefined,
    };
    const tracker = createFallTracker(never);
    tracker.release(tomato(3, [0, 0, 60]));
    const landed: Landed[] = [];
    for (let i = 0; i < 8; i++) landed.push(...tracker.advance(0.5, [tomato(3, [0, 0, 60])], basket));
    expect(landed).toEqual([{ tomatoId: 3, inBasket: false }]);
  });

  it('drops a falling tomato that disappeared from the store, and forgets everything on reset', () => {
    const physics = createFakePhysics();
    physics.attach(1, [5, 0, 40], 3);
    const tracker = createFallTracker(physics);
    tracker.release(tomato(1, [5, 0, 40]));
    expect(tracker.advance(0.01, [], basket)).toEqual([]);
    expect(tracker.isFalling(1)).toBe(false);
    tracker.release(tomato(1, [5, 0, 40]));
    tracker.reset();
    expect(tracker.isFalling(1)).toBe(false);
  });
});
```

Run: `npx vitest run packages/sim/src/plant/falling.test.ts`
Expected: FAIL — `Cannot find module './falling'`.

- [ ] **Step 2: Implémentation du suivi de chute**

`packages/sim/src/plant/falling.ts` :

```ts
import type { BasketPose, Tomato } from '@tomato/shared';
import { landingOutcome, shouldDecide } from './landing';
import type { PlantPhysics } from './physics';

export interface Landed {
  tomatoId: number;
  inBasket: boolean;
}

export interface FallTracker {
  /** Libère le corps de la tomate et démarre son chrono de chute ; false si elle tombe déjà. */
  release(tomato: Tomato): boolean;
  /** Cumule le temps de chute et renvoie les tomates décidées à cette frame (chacune une seule fois). */
  advance(dtS: number, tomatoes: readonly Tomato[], basket: BasketPose): Landed[];
  isFalling(id: number): boolean;
  reset(): void;
}

export function createFallTracker(physics: PlantPhysics): FallTracker {
  /** Temps de chute cumulé par tomate en cours de chute. */
  const airborne = new Map<number, number>();
  return {
    release(tomato) {
      if (airborne.has(tomato.id)) return false;
      physics.release(tomato.id, tomato.radiusCm);
      airborne.set(tomato.id, 0);
      return true;
    },
    advance(dtS, tomatoes, basket) {
      const landed: Landed[] = [];
      for (const [id, elapsed] of airborne) {
        const t = tomatoes.find((x) => x.id === id);
        if (!t) {
          airborne.delete(id);
          continue;
        }
        const total = elapsed + dtS;
        airborne.set(id, total);
        if (!shouldDecide(physics.speedOf(id), total)) continue;
        airborne.delete(id);
        landed.push({ tomatoId: id, inBasket: landingOutcome(t.positionCm, t.radiusCm, basket) === 'in_basket' });
      }
      return landed;
    },
    isFalling: (id) => airborne.has(id),
    reset: () => airborne.clear(),
  };
}
```

Run: `npx vitest run packages/sim/src/plant/falling.test.ts`
Expected: PASS, 5 tests.

- [ ] **Step 3: Tests du module pour la coupe (échouent)**

Ajouter à la fin de `packages/sim/src/plant/plantModule.test.ts` :

```ts
describe('plantModule cut and landing', () => {
  /** La tomate la plus haute : elle a toujours de la place pour tomber dans le panier. */
  function highest(ctx: SimContext) {
    return [...ctx.store.get().tomatoes].sort((a, b) => b.positionCm[2] - a.positionCm[2])[0]!;
  }

  it('releases a cut tomato, follows it in the store and emits tomato_landed once with inBasket = true', async () => {
    const { ctx, mod, events } = await setup();
    const t0 = highest(ctx);
    ctx.store.update((s) => ({ ...s, basket: { ...s.basket, centerCm: [t0.positionCm[0], t0.positionCm[1], 5] } }));
    ctx.signals.emit({ type: 'tomato_cut', tomatoId: t0.id });
    expect(ctx.store.get().tomatoes.find((t) => t.id === t0.id)!.attached).toBe(false);
    tick(mod, ctx, 1);
    expect(events.filter((e) => e.type === 'tomato_landed')).toEqual([{ type: 'tomato_landed', tomatoId: t0.id, inBasket: true }]);
    const after = ctx.store.get().tomatoes.find((t) => t.id === t0.id)!;
    expect(after.positionCm[2]).toBeCloseTo(5 + after.radiusCm);
    expect(after.positionCm[2]).toBeLessThan(t0.positionCm[2]);
    tick(mod, ctx, 3);
    expect(events.filter((e) => e.type === 'tomato_landed')).toHaveLength(1);
  });

  it('emits inBasket = false when the tomato lands on the floor', async () => {
    const { ctx, mod, events } = await setup();
    const t0 = highest(ctx);
    ctx.store.update((s) => ({ ...s, basket: { ...s.basket, centerCm: [t0.positionCm[0] + 30, t0.positionCm[1] + 30, 5] } }));
    ctx.signals.emit({ type: 'tomato_cut', tomatoId: t0.id });
    tick(mod, ctx, 1);
    expect(events.filter((e) => e.type === 'tomato_landed')).toEqual([{ type: 'tomato_landed', tomatoId: t0.id, inBasket: false }]);
    const after = ctx.store.get().tomatoes.find((t) => t.id === t0.id)!;
    expect(after.positionCm[2]).toBeCloseTo(after.radiusCm);
  });

  it('ignores a cut for an unknown or already cut tomato', async () => {
    const { ctx, mod, events } = await setup();
    const t0 = highest(ctx);
    ctx.signals.emit({ type: 'tomato_cut', tomatoId: 999 });
    ctx.signals.emit({ type: 'tomato_cut', tomatoId: t0.id });
    ctx.signals.emit({ type: 'tomato_cut', tomatoId: t0.id });
    tick(mod, ctx, 4);
    expect(events.filter((e) => e.type === 'tomato_landed')).toHaveLength(1);
  });

  it('forgets a falling tomato on new_plant', async () => {
    const { ctx, mod, events } = await setup();
    ctx.signals.emit({ type: 'tomato_cut', tomatoId: highest(ctx).id });
    mod.handle!({ type: 'new_plant', seed: 5 }, ctx);
    tick(mod, ctx, 4);
    expect(events.filter((e) => e.type === 'tomato_landed')).toEqual([]);
    for (const t of ctx.store.get().tomatoes) expect(t.attached).toBe(true);
  });
});
```

Run: `npx vitest run packages/sim/src/plant/plantModule.test.ts`
Expected: FAIL — les 4 nouveaux tests échouent (`attached` reste `true`, aucun événement).

- [ ] **Step 4: Module complet (remplace tout le fichier)**

`packages/sim/src/plant/plantModule.ts` :

```ts
import { fail, ok } from '@tomato/shared';
import type { SimContext, SimModule } from '../core/module';
import { createFakePhysics } from './fakePhysics';
import { createFallTracker } from './falling';
import type { FallTracker } from './falling';
import { generatePlant } from './generatePlant';
import type { PlantSpec, TomatoSpec } from './generatePlant';
import type { PlantPhysics } from './physics';
import { nextToRipen, ripenTomato, tomatoesFromSpec } from './plantState';
import type { PlantView } from './view';

export interface PlantModuleDeps {
  createPhysics?: (ctx: SimContext) => Promise<PlantPhysics>;
  createView?: (ctx: SimContext) => Promise<PlantView | null>;
}

async function defaultPhysics(ctx: SimContext): Promise<PlantPhysics> {
  if (!ctx.scene) return createFakePhysics();
  const { createRapierPhysics } = await import('./rapierPhysics');
  return createRapierPhysics();
}

async function defaultView(ctx: SimContext): Promise<PlantView | null> {
  if (!ctx.scene) return null;
  const { createPlantView } = await import('./plantView');
  return createPlantView(ctx.scene);
}

const nextSeed = (seed: number): number => (seed + 1) >>> 0;

export function createPlantModule(deps: PlantModuleDeps = {}): SimModule {
  const specById = new Map<number, TomatoSpec>();
  /** Instant sim de maturité par tomate (relatif à la création du plant, modifié par ripen_next). */
  const ripenAt = new Map<number, number>();
  let physics: PlantPhysics = createFakePhysics();
  let fall: FallTracker | null = null;
  let view: PlantView | null = null;

  function loadPlant(ctx: SimContext, seed: number): PlantSpec {
    const spec = generatePlant(seed);
    const simTimeS = ctx.store.get().simTimeS;
    specById.clear();
    ripenAt.clear();
    for (const t of spec.tomatoes) {
      specById.set(t.id, t);
      ripenAt.set(t.id, simTimeS + t.ripenAtS);
    }
    ctx.registry.plantSpec = spec;
    physics.clear();
    fall?.reset();
    const tomatoes = tomatoesFromSpec(spec, 0);
    for (const t of tomatoes) physics.attach(t.id, t.positionCm, t.radiusCm);
    ctx.store.update((s) => ({ ...s, seed, tomatoes, targetTomatoId: null }));
    view?.setSpec(spec);
    view?.sync(tomatoes);
    return spec;
  }

  /** Mûrit les attachées, suit les détachées, pousse la vue, puis décide les chutes et émet tomato_landed. */
  function refresh(ctx: SimContext, dtSimS: number): void {
    const s = ctx.store.get();
    const tomatoes = s.tomatoes.map((t) => {
      const spec = specById.get(t.id);
      if (!spec) return t;
      if (t.attached) return ripenTomato(t, spec, ripenAt.get(t.id) ?? spec.ripenAtS, s.simTimeS);
      return { ...t, positionCm: physics.positionOf(t.id) ?? t.positionCm };
    });
    ctx.store.update((st) => ({ ...st, tomatoes }));
    view?.sync(tomatoes);
    const landed = fall?.advance(dtSimS, tomatoes, s.basket) ?? [];
    for (const l of landed) ctx.emitEvent({ type: 'tomato_landed', tomatoId: l.tomatoId, inBasket: l.inBasket });
  }

  function onCut(ctx: SimContext, tomatoId: number): void {
    const t = ctx.store.get().tomatoes.find((x) => x.id === tomatoId);
    if (!t || !t.attached || !fall) return;
    if (!fall.release(t)) return;
    ctx.store.update((s) => ({
      ...s,
      tomatoes: s.tomatoes.map((x) => (x.id === tomatoId ? { ...x, attached: false } : x)),
    }));
    view?.sync(ctx.store.get().tomatoes);
  }

  return {
    name: 'plant',
    async init(ctx) {
      physics = await (deps.createPhysics ?? defaultPhysics)(ctx);
      fall = createFallTracker(physics);
      view = await (deps.createView ?? defaultView)(ctx);
      physics.setBasket(ctx.store.get().basket);
      loadPlant(ctx, ctx.store.get().seed);
      ctx.signals.on('tomato_cut', (sig) => onCut(ctx, sig.tomatoId));
    },
    update(dtSimS, ctx) {
      if (dtSimS <= 0) return;
      physics.setBasket(ctx.store.get().basket);
      physics.step(dtSimS);
      refresh(ctx, dtSimS);
    },
    handle(action, ctx) {
      const s = ctx.store.get();
      switch (action.type) {
        case 'ripen_next': {
          const id = nextToRipen(s.tomatoes, ripenAt);
          if (id === null) return fail(s, 'not_available', 'no unripe tomato left on the plant');
          ripenAt.set(id, s.simTimeS);
          refresh(ctx, 0);
          return ok(ctx.store.get(), `tomato ${id} is ripe`);
        }
        case 'new_plant': {
          const seed = action.seed ?? nextSeed(s.seed);
          loadPlant(ctx, seed);
          ctx.signals.emit({ type: 'plant_regenerated', seed });
          ctx.emitEvent({ type: 'plant_regenerated', seed });
          return ok(ctx.store.get(), `new plant with seed ${seed}`);
        }
        default:
          return null;
      }
    },
  };
}

/** Instance ajoutée à MODULES dans App.tsx. */
export const plantModule: SimModule = createPlantModule();
```

Run: `npx vitest run packages/sim/src/plant`
Expected: PASS — `plantModule.test.ts` 11 tests ; total du dossier 42 tests (random 2, generatePlant 4, ripening 4, landing 6, plantState 6, fakePhysics 4, falling 5, plantModule 11) — 4 de plus après la Task 7.

- [ ] **Step 5: Commit**

```bash
git add packages/sim/src/plant/falling.ts packages/sim/src/plant/falling.test.ts packages/sim/src/plant/plantModule.ts packages/sim/src/plant/plantModule.test.ts
git commit -m "feat(plant): chute sur signal tomato_cut, décision panier/sol et événement tomato_landed unique"
```

---
### Task 7: Plant procédural v2 (branches courbes, folioles, première tomate déjà en transition)

**Files:**
- Modify: `packages/sim/src/plant/generatePlant.ts` (fichier complet ci-dessous), `packages/sim/src/plant/generatePlant.test.ts` (bloc ajouté)

**Interfaces:**
- Consumes: `between`, `createRng`, `intBetween` de `./random` ; helpers vectoriels de `@tomato/shared`.
- Produces:
  - `BranchSpec { fromCm: Vec3; midCm: Vec3; toCm: Vec3 }` — `midCm` = point de contrôle d'une Bézier quadratique, au-dessus de la corde.
  - `branchPoint(b: BranchSpec, t: number): Vec3` — point de la branche courbe (utilisé par le maillage, les feuilles et les ancres des tomates ; M2 ne lit que les pédoncules du store et les feuilles du registry, rien ne change pour lui).
  - `generatePlant(seed, options?)` : invariants conservés (hauteur 60–80, 3–5 branches, 4–8 tomates, pédoncule 4–6, inclinaison 0–60°, feuilles 8–14 cm, `leaves ≥ 2 × branches`) ; nouveautés : 3–5 nœuds de feuilles par branche avec 2–3 folioles chacun (donc `leaves ≥ 6 × branches`), instants de maturité `order · interval + interval / 2` (la première tomate est à `ripenAtS = 10` : elle commence à changer de couleur dès le chargement).

- [ ] **Step 1: Tests v2 (échouent)**

Ajouter à la fin de `packages/sim/src/plant/generatePlant.test.ts` (les tests existants restent tels quels) :

```ts
describe('generatePlant v2', () => {
  const v2 = generatePlant(123);

  it('curves every branch through a control point above its chord', () => {
    for (const b of v2.branches) {
      expect(b.midCm[2]).toBeGreaterThan((b.fromCm[2] + b.toCm[2]) / 2);
      expect(branchPoint(b, 0)).toEqual(b.fromCm);
      expect(branchPoint(b, 1)).toEqual(b.toCm);
      const mid = branchPoint(b, 0.5);
      expect(mid[2]).toBeGreaterThan((b.fromCm[2] + b.toCm[2]) / 2);
    }
  });

  it('anchors every tomato on a curved branch', () => {
    for (const t of v2.tomatoes) {
      let best = Infinity;
      for (const b of v2.branches) {
        for (let i = 0; i <= 100; i++) best = Math.min(best, vlen(vsub(branchPoint(b, i / 100), t.anchorCm)));
      }
      expect(best).toBeLessThan(0.5);
    }
  });

  it('is denser: at least six leaflets per branch, grouped 2-3 per node', () => {
    expect(v2.leaves.length).toBeGreaterThanOrEqual(v2.branches.length * 6);
  });

  it('staggers ripening so the first tomato is already turning shortly after load', () => {
    const times = v2.tomatoes.map((t) => t.ripenAtS).sort((a, b) => a - b);
    expect(times[0]).toBe(10);
    for (let i = 1; i < times.length; i++) expect(times[i]! - times[i - 1]!).toBe(20);
  });
});
```

Et compléter l'import en tête du fichier : `import { branchPoint, generatePlant } from './generatePlant';`.

Run: `npx vitest run packages/sim/src/plant/generatePlant.test.ts`
Expected: FAIL — `branchPoint` n'est pas exporté ; `midCm` undefined.

- [ ] **Step 2: Implémentation (remplace tout le fichier)**

`packages/sim/src/plant/generatePlant.ts` :

```ts
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
    const pedicel = between(rng, 4, 6);
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
```

Run: `npx vitest run packages/sim/src/plant`
Expected: PASS — `generatePlant.test.ts` 8 tests (4 anciens intacts + 4 nouveaux) ; `plantState.test.ts` passe toujours (ses specs à la main ont `branches: []`) ; total 46 tests dans le dossier.

- [ ] **Step 3: Commit**

```bash
git add packages/sim/src/plant/generatePlant.ts packages/sim/src/plant/generatePlant.test.ts
git commit -m "feat(plant): plant v2 — branches courbes, folioles groupées, maturités échelonnées dès le chargement"
```

---

### Task 8: Maillage v2 et vue Three synchronisée depuis le store

**Files:**
- Modify: `packages/sim/src/plant/buildPlantMesh.ts` (fichier complet ci-dessous)
- Create: `packages/sim/src/plant/plantView.ts`

**Interfaces:**
- Consumes: `PlantSpec`, `LeafSpec`, `BranchSpec` ; `worldToThree` ; `getLeafTexture` (canvas, navigateur seulement) ; `SceneHandle` ; `PlantView` de `./view` ; `Tomato`.
- Produces:
  - `buildPlantMesh(spec: PlantSpec): Group` — branches en tubes Bézier, folioles, tomates `tomato-<id>` (`userData.tomatoId`), pédoncules `pedicel-<id>` (nouveau : la vue les cache après la coupe).
  - `tomatoColor(ripeness: number): Color` (inchangé).
  - `createPlantView(scene: SceneHandle): PlantView` — `setSpec` remplace le groupe du plant dans la scène ; `sync` applique à chaque tomate la couleur `tomatoColor(ripeness)`, l'échelle `radiusCm / radiusCm de la spec` (× 0,9 en hauteur comme en v1), la position monde → Three, et cache le pédoncule si `attached === false`.
- Aucun test Node (canvas et WebGL) : couvert par `npm run shot` et le visual-checker.

- [ ] **Step 1: Maillage v2 (remplace tout le fichier)**

`packages/sim/src/plant/buildPlantMesh.ts` :

```ts
import {
  CatmullRomCurve3, Color, CylinderGeometry, DoubleSide, Group, Mesh, MeshStandardMaterial,
  PlaneGeometry, QuadraticBezierCurve3, SphereGeometry, TubeGeometry, Vector3,
} from 'three';
import type { Vec3 } from '@tomato/shared';
import { worldToThree } from '../three/frame';
import { getLeafTexture } from './leafTexture';
import type { BranchSpec, LeafSpec, PlantSpec } from './generatePlant';

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

function branchMesh(b: BranchSpec, radius: number): Mesh {
  const curve = new QuadraticBezierCurve3(worldToThree(b.fromCm), worldToThree(b.midCm), worldToThree(b.toCm));
  const mesh = new Mesh(new TubeGeometry(curve, 16, radius, 8, false), stemMaterial);
  mesh.castShadow = true;
  return mesh;
}

function leafMesh(leaf: LeafSpec, material: MeshStandardMaterial): Mesh {
  const mesh = new Mesh(new PlaneGeometry(leaf.sizeCm, leaf.sizeCm * 1.4), material);
  mesh.position.copy(worldToThree(leaf.positionCm));
  mesh.quaternion.setFromUnitVectors(new Vector3(0, 0, 1), worldToThree(leaf.normal).normalize());
  mesh.rotateZ((leaf.spinDeg * Math.PI) / 180);
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

  for (const b of spec.branches) group.add(branchMesh(b, spec.stemRadiusCm * 0.6));

  const leafMat = new MeshStandardMaterial({ map: getLeafTexture(), alphaTest: 0.5, side: DoubleSide, roughness: 0.9 });
  for (const leaf of spec.leaves) group.add(leafMesh(leaf, leafMat));

  for (const t of spec.tomatoes) {
    const pedicel = segmentMesh(t.anchorCm, t.centerCm, 0.35);
    pedicel.name = `pedicel-${t.id}`;
    group.add(pedicel);
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

/** Couleur d'un fruit selon sa maturité 0..1 (vert → orange → rouge). */
export function tomatoColor(ripeness: number): Color {
  const green = new Color('#3f9a3a');
  const orange = new Color('#e08a1e');
  const red = new Color('#c8261b');
  return ripeness < 0.5 ? green.clone().lerp(orange, ripeness * 2) : orange.clone().lerp(red, (ripeness - 0.5) * 2);
}
```

- [ ] **Step 2: Vue synchronisée**

`packages/sim/src/plant/plantView.ts` :

```ts
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
```

Run: `npx vitest run packages/sim && npx tsc --noEmit -p packages/sim`
Expected: Vitest PASS (46 tests dans `plant`, 5 dans `core`, 2 dans `three`) ; `tsc` signale encore uniquement `Cannot find module './rapierPhysics'` dans `plantModule.ts` (corrigé en Task 9).

- [ ] **Step 3: Commit**

```bash
git add packages/sim/src/plant/buildPlantMesh.ts packages/sim/src/plant/plantView.ts
git commit -m "feat(plant): maillage v2 (branches courbes, pédoncules nommés) et vue Three synchronisée depuis le store"
```

---
### Task 9: Physique Rapier (navigateur)

**Files:**
- Create: `packages/sim/src/plant/rapierPhysics.ts`

**Interfaces:**
- Consumes: `@dimforge/rapier3d-compat` 0.20 (API vérifiée dans `dist/*.d.ts` : `RAPIER.init(): Promise<void>`, `new RAPIER.World(gravity: Vector)`, `world.timestep` (setter), `world.step()`, `world.createRigidBody(desc)`, `world.createCollider(desc, parent?)`, `world.removeRigidBody(body)` (retire aussi ses colliders), `world.free()`, `RigidBodyDesc.kinematicPositionBased() / .dynamic()`, `.setTranslation(x, y, z)`, `.setCcdEnabled(bool)`, `ColliderDesc.ball(r)`, `.cuboid(hx, hy, hz)`, `.setTranslation(x, y, z)`, `.setSensor(bool)`, `.setRestitution(r)`, `.setFriction(f)`, `.setDensity(d)`, `body.setBodyType(RAPIER.RigidBodyType.Dynamic, wakeUp)`, `body.setNextKinematicTranslation({ x, y, z })`, `body.setLinvel(v, wakeUp)`, `body.setAngvel(v, wakeUp)`, `body.translation(): Vector`, `body.linvel(): Vector`, `collider.setRadius(r)`) ; `worldToThree`, `threeToWorld` ; `PlantPhysics`.
- Produces: `createRapierPhysics(): Promise<PlantPhysics>` — monde Rapier dans le repère Three (gravité `{ 0, −981, 0 }` cm/s²), sol = cuboïde dont la face supérieure est à y = 0, tomates = corps cinématiques (attachées) devenant dynamiques à `release`, panier = corps cinématique portant un fond, quatre parois et un capteur volumique, repositionné par `setNextKinematicTranslation` à chaque `setBasket`. Pas fixe 1/120 s avec accumulateur (borné à 240 sous-pas par frame pour les grands `timeScale`).
- Ne jamais importer ce fichier depuis un test Node ni statiquement depuis `plantModule.ts` (import dynamique seulement).

- [ ] **Step 1: Implémentation**

`packages/sim/src/plant/rapierPhysics.ts` :

```ts
import RAPIER from '@dimforge/rapier3d-compat';
import type { Collider, RigidBody, World } from '@dimforge/rapier3d-compat';
import { Vector3 } from 'three';
import type { BasketPose, Vec3 } from '@tomato/shared';
import { threeToWorld, worldToThree } from '../three/frame';
import type { PlantPhysics } from './physics';

/** Gravité en cm/s², appliquée sur l'axe Y de Three (le haut). */
export const GRAVITY_CM_S2 = 981;
/** Pas fixe de la physique ; le dt sim de chaque frame est découpé en sous-pas. */
const FIXED_DT_S = 1 / 120;
/** Sous-pas maximum par frame : borne le coût quand timeScale est grand. */
const MAX_SUBSTEPS = 240;
const WALL_CM = 0.5;
const FLOOR_THICKNESS_CM = 1;
const FLOOR_HALF_EXTENT_CM = 200;

interface TomatoBody {
  body: RigidBody;
  collider: Collider;
}

const toRapier = (v: Vec3): { x: number; y: number; z: number } => {
  const p = worldToThree(v);
  return { x: p.x, y: p.y, z: p.z };
};
const toWorld = (v: { x: number; y: number; z: number }): Vec3 => threeToWorld(new Vector3(v.x, v.y, v.z));

/** Panier : corps cinématique dont l'origine est le centre du fond (basket.centerCm) ; Y monde → −z Three. */
function createBasketBody(world: World, pose: BasketPose): RigidBody {
  const [w, d] = pose.sizeCm;
  const hw = w / 2;
  const hd = d / 2;
  const hh = pose.depthCm / 2;
  const body = world.createRigidBody(RAPIER.RigidBodyDesc.kinematicPositionBased());
  const solid = (hx: number, hy: number, hz: number, x: number, y: number, z: number): void => {
    world.createCollider(RAPIER.ColliderDesc.cuboid(hx, hy, hz).setTranslation(x, y, z).setFriction(0.8), body);
  };
  solid(hw + WALL_CM, FLOOR_THICKNESS_CM / 2, hd + WALL_CM, 0, -FLOOR_THICKNESS_CM / 2, 0);
  solid(WALL_CM / 2, hh, hd + WALL_CM, hw + WALL_CM / 2, hh, 0);
  solid(WALL_CM / 2, hh, hd + WALL_CM, -(hw + WALL_CM / 2), hh, 0);
  solid(hw + WALL_CM, hh, WALL_CM / 2, 0, hh, hd + WALL_CM / 2);
  solid(hw + WALL_CM, hh, WALL_CM / 2, 0, hh, -(hd + WALL_CM / 2));
  // Capteur volumique du panier (spec 4.1) : le volume intérieur, sans contact. La décision
  // harvested/missed reste la règle pure landingOutcome, appliquée sur la position du corps.
  world.createCollider(RAPIER.ColliderDesc.cuboid(hw, hh, hd).setTranslation(0, hh, 0).setSensor(true), body);
  return body;
}

export async function createRapierPhysics(): Promise<PlantPhysics> {
  await RAPIER.init();
  const world: World = new RAPIER.World({ x: 0, y: -GRAVITY_CM_S2, z: 0 });
  world.timestep = FIXED_DT_S;
  world.createCollider(
    RAPIER.ColliderDesc.cuboid(FLOOR_HALF_EXTENT_CM, 1, FLOOR_HALF_EXTENT_CM).setTranslation(0, -1, 0).setFriction(0.8),
  );

  const tomatoes = new Map<number, TomatoBody>();
  let basket: RigidBody | null = null;
  let accumulator = 0;

  return {
    attach(id, centerCm, radiusCm) {
      const prev = tomatoes.get(id);
      if (prev) world.removeRigidBody(prev.body);
      const p = toRapier(centerCm);
      const body = world.createRigidBody(
        RAPIER.RigidBodyDesc.kinematicPositionBased().setTranslation(p.x, p.y, p.z).setCcdEnabled(true),
      );
      const collider = world.createCollider(
        RAPIER.ColliderDesc.ball(radiusCm).setRestitution(0.15).setFriction(0.7).setDensity(1),
        body,
      );
      tomatoes.set(id, { body, collider });
    },
    release(id, radiusCm) {
      const t = tomatoes.get(id);
      if (!t) return;
      t.collider.setRadius(radiusCm);
      t.body.setBodyType(RAPIER.RigidBodyType.Dynamic, true);
      t.body.setLinvel({ x: 0, y: 0, z: 0 }, true);
      t.body.setAngvel({ x: 0, y: 0, z: 0 }, true);
    },
    clear() {
      for (const t of tomatoes.values()) world.removeRigidBody(t.body);
      tomatoes.clear();
      accumulator = 0;
    },
    step(dtS) {
      if (dtS <= 0) return;
      accumulator = Math.min(accumulator + dtS, FIXED_DT_S * MAX_SUBSTEPS);
      while (accumulator >= FIXED_DT_S) {
        world.step();
        accumulator -= FIXED_DT_S;
      }
    },
    positionOf(id) {
      const t = tomatoes.get(id);
      return t ? toWorld(t.body.translation()) : null;
    },
    speedOf(id) {
      const t = tomatoes.get(id);
      if (!t) return 0;
      const v = t.body.linvel();
      return Math.hypot(v.x, v.y, v.z);
    },
    setBasket(pose) {
      basket ??= createBasketBody(world, pose);
      basket.setNextKinematicTranslation(toRapier(pose.centerCm));
    },
    dispose() {
      tomatoes.clear();
      basket = null;
      world.free();
    },
  };
}
```

Run: `npx tsc --noEmit -p packages/sim && npm run lint`
Expected: aucune erreur (les deux `import()` dynamiques de `plantModule.ts` résolvent maintenant).

- [ ] **Step 2: Commit**

```bash
git add packages/sim/src/plant/rapierPhysics.ts
git commit -m "feat(plant): physique Rapier — sol, tomates cinématiques puis dynamiques, panier composé avec capteur"
```

---

### Task 10: Brancher le module dans `App.tsx` et attendre le plant dans la capture

**Files:**
- Modify: `packages/sim/src/App.tsx`, `packages/sim/tests/scene.spec.ts`

**Interfaces:**
- Consumes: `plantModule` ; `window.__tomato.runtime` (déjà exposé par `App.tsx`).
- Produces: `MODULES = [plantModule]` ; plus de plant statique ; la capture attend `registry.plantSpec`, déclenche un `ripen_next` via le runtime (preuve dans le navigateur que le dispatch fonctionne et qu'une tomate rouge apparaît) puis capture `data/shots/scene.png`.

- [ ] **Step 1: `App.tsx`**

Remplacer tout le fichier `packages/sim/src/App.tsx` par :

```tsx
import { useCallback } from 'react';
import { createDefaultWorld } from '@tomato/shared';
import { createRuntime, type SimRuntime } from './core/runtime';
import type { SimModule } from './core/module';
import { plantModule } from './plant/plantModule';
import { SpectatorView } from './three/SpectatorView';
import type { SceneHandle } from './three/createScene';

const SEED = 20260917;

/** Modules de la sim, dans l'ordre de dispatch des actions : M1 (plant), puis M2 (robot), M3 (cameras). */
const MODULES: SimModule[] = [plantModule];

declare global {
  interface Window {
    __tomato?: { runtime: SimRuntime };
  }
}

export function App() {
  const onReady = useCallback((scene: SceneHandle) => {
    let stopFrames: (() => void) | null = null;
    void createRuntime(createDefaultWorld(SEED), scene, MODULES).then((runtime) => {
      window.__tomato = { runtime };
      stopFrames = scene.onFrame((dt) => runtime.step(dt));
    });
    return () => stopFrames?.();
  }, []);

  return (
    <main className="h-full w-full grid grid-cols-[55fr_45fr]">
      <section className="relative h-full">
        <SpectatorView onReady={onReady} />
        <div className="absolute left-3 top-3 text-xs uppercase tracking-widest text-neutral-400">Vue spectateur</div>
      </section>
      <aside className="border-l border-neutral-800 p-4 text-sm text-neutral-400">Vues de l'agent (Étape 2)</aside>
    </main>
  );
}
```

Note : en développement, `StrictMode` monte le composant deux fois ; `plantModule.init` est donc appelé deux fois avec deux contextes. C'est sans effet visible : la seconde initialisation reconstruit physique et vue dans la nouvelle scène, la première scène est détruite par `SpectatorView`.

- [ ] **Step 2: Capture Playwright**

Remplacer tout le fichier `packages/sim/tests/scene.spec.ts` par :

```ts
import { expect, test } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';

const shotsDir = resolve(import.meta.dirname, '../../../data/shots');

test('spectator scene renders the plant module and is captured', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/');
  const canvas = page.getByTestId('spectator');
  await expect(canvas).toBeVisible();
  await page.waitForFunction(() => window.__tomato?.runtime.ctx.registry.plantSpec !== null, undefined, { timeout: 30_000 });
  const tomatoCount = await page.evaluate(() => window.__tomato!.runtime.ctx.store.get().tomatoes.length);
  expect(tomatoCount).toBeGreaterThanOrEqual(4);
  const ripen = await page.evaluate(() => window.__tomato!.runtime.apply({ type: 'ripen_next' }));
  expect(ripen.ok).toBe(true);
  await page.waitForTimeout(1500);
  const states = await page.evaluate(() => window.__tomato!.runtime.ctx.store.get().tomatoes.map((t) => t.state));
  expect(states).toContain('ripe');
  mkdirSync(shotsDir, { recursive: true });
  await page.screenshot({ path: resolve(shotsDir, 'scene.png') });
  expect(errors).toEqual([]);
});
```

- [ ] **Step 3: Vérifier à la main**

Run: `npm run dev:sim`, ouvrir `http://localhost:5173`, puis dans la console du navigateur :

```js
__tomato.runtime.apply({ type: 'ripen_next' })
__tomato.runtime.ctx.signals.emit({ type: 'tomato_cut', tomatoId: __tomato.runtime.ctx.store.get().tomatoes[0].id })
```

Expected: le plant est plus dense qu'en Étape 1 (branches arquées, feuilles groupées) ; une tomate est déjà orangée quelques secondes après le chargement ; `ripen_next` rend une tomate rouge et plus grosse ; le signal `tomato_cut` fait tomber la tomate 1 au sol (ou dans le panier si `__tomato.runtime.ctx.store.update(s => ({ ...s, basket: { ...s.basket, centerCm: [x, y, 5] } }))` a été placé sous elle), le pédoncule disparaît, et `__tomato.runtime.onEvent(console.log)` affiche un unique `tomato_landed`.

- [ ] **Step 4: Commit**

```bash
git add packages/sim/src/App.tsx packages/sim/tests/scene.spec.ts
git commit -m "feat(sim): plantModule branché dans MODULES, plant statique retiré, capture avec ripen_next"
```

---

### Task 11: Gates, capture et PR

**Files:**
- Modify: `docs/superpowers/specs/2026-09-17-etape-2-m1-plant-checklist.md` (cocher), `data/build_verdict.json` (non suivi)

- [ ] **Step 1: Gates**

Run: `cd C:/Tomato-collector/.worktrees/m1-plant && npm run lint && npm run typecheck && npm test && npm run build`
Expected: lint 0 erreur ; typecheck 0 erreur ; Vitest vert (shared 18 + sim 53 + server 1 = 72 tests) ; build Vite OK — un chunk séparé pour `rapierPhysics` (≈ 2,9 Mo, WASM inliné ; l'avertissement de taille de Vite est acceptable).

- [ ] **Step 2: Capture**

Run: `npm run shot`
Expected: 1 test Playwright vert ; `data/shots/scene.png` existe. Ouvrir l'image (outil Read) : plant dense, feuilles groupées, tomates de couleurs variées (au moins une rouge, une orangée, des vertes), ombres au sol.

- [ ] **Step 3: Cocher la checklist, verdict, PR**

Cocher chaque `[SPEC-N]`, `[TEST-N]`, `[GATE-N]` de `docs/superpowers/specs/2026-09-17-etape-2-m1-plant-checklist.md` avec la sortie fraîche sous les yeux, puis :

```bash
git add docs/superpowers/specs/2026-09-17-etape-2-m1-plant-checklist.md
git commit -m "docs(plant): checklist M1 cochée"
git push -u origin feat/1-m1-plant
gh pr create --base main --title "feat(plant): M1 plant complet — mûrissement, plant v2, physique Rapier, capteur panier" --body "Closes #1

Checklist: docs/superpowers/specs/2026-09-17-etape-2-m1-plant-checklist.md
Plan: docs/superpowers/plans/2026-09-17-etape-2-m1-plant.md

## Gates
- lint: pass
- typecheck: pass
- test: pass (72 tests)
- build: pass
- shot: pass (data/shots/scene.png)

🤖 Generated with [Claude Code](https://claude.com/claude-code)"
gh issue edit 1 --remove-label todo --remove-label in-progress --add-label in-review
```

Écrire `data/build_verdict.json` conformément à `.claude/agents/builder.md` (`status: "pr_created"`, numéro de PR, branche, `items_skipped: []`, `plan_deviations`, gates).

---

## Auto-revue du plan

**Couverture de la spec et du contrat (M1) :**
- Spec 4.1 « mûrissement : instant de maturité, couleur vert → orange → rouge, rayon ×1.0 → ×1.3, états unripe/turning/ripe » → Task 1 (règles pures), Task 3 (champs du store), Task 5 (mise à jour à chaque frame), Task 8 (`tomatoColor` et échelle dans la vue).
- Spec 4.1 « physique Rapier : tomate = corps rigide fixé, `cut` libère, panier composé avec capteur volumique, sol collider, contact sol hors capteur = missed » → Task 9 (corps cinématiques puis dynamiques, panier fond + parois + capteur, sol), Task 2 et 6 (décision `in_basket` / `floor`, événement `tomato_landed`).
- Spec 4.1 « bouton nouveau plant régénère avec une autre graine » → `new_plant` (Task 5) ; le bouton lui-même est M7.
- Spec 4.1 « feuilles en plans double face à texture alpha, occultantes » → conservé (v1) et densifié (Task 7 folioles, Task 8 maillage).
- Contrat « M1 écrit tomatoes[] (positions, ripeness, state, radiusCm, stem, attached, positionCm en chute) et seed » → Tasks 3, 5, 6. « stem.fromCm = anchorCm, toCm = centerCm − dir·radiusCm » → `stemOf` (Task 3, testé).
- Contrat « M1 publie registry.plantSpec à init et à new_plant, émet signal plant_regenerated » → Task 5 (testé). « M1 écoute tomato_cut et libère » → Task 6 (testé). « M1 émet tomato_landed et plant_regenerated vers le serveur » → Tasks 5 et 6 (testés).
- Contrat « ripeness = clamp((t − (ripenAtS − 15)) / 15), seuils 0,35 / 0,9, rayon × (1 + 0,3·ripeness), ripen_next : ripenAtS = simTimeS » → Tasks 1 et 5 (testés).
- Contrat « gravité −981 sur Y Three, landingOutcome, repos < 2 cm/s ou 3 s » → Tasks 2, 6, 9.
- Contrat « M3 écrit visibleIn » → préservé par `ripenTomato` et la copie du store (testé Task 3 et Task 5).
- Scope (h) « v2 sans casser generatePlant.test.ts » → Task 7 : les quatre tests existants restent inchangés et passent ; (i) `App.tsx` → Task 10 ; (j) `npm run shot` → Tasks 10 et 11.
- Spec 8 « unitaires : mûrissement, test dans le panier » → `ripening.test.ts`, `landing.test.ts`, plus `plantState`, `fakePhysics`, `falling`, `plantModule`.

**Recherche de placeholders :** aucun « TODO », « à compléter », « similaire à » ; chaque tâche contient le test complet, le code complet et les commandes avec sortie attendue. Les deux fichiers réécrits en entier (`plantModule.ts` en Task 6, `generatePlant.ts` et `buildPlantMesh.ts` en Tasks 7-8) sont donnés intégralement.

**Cohérence des types :** `PlantPhysics` (Task 4) est implémentée à l'identique par `createFakePhysics` (Task 4), le stub `never` du test de Task 6 et `createRapierPhysics` (Task 9) : `attach(id, centerCm, radiusCm)`, `release(id, radiusCm)`, `clear()`, `step(dtS)`, `positionOf(id): Vec3 | null`, `speedOf(id): number`, `setBasket(basket)`, `dispose()`. `PlantView` (Task 5, `view.ts`) est implémentée par `createPlantView` (Task 8) et consommée par `plantModule` via `PlantModuleDeps.createView`. `FallTracker.advance` reçoit `readonly Tomato[]` et `BasketPose`, renvoie `Landed[]` dont les champs `tomatoId` / `inBasket` alimentent directement `SimEvent 'tomato_landed'`. `BranchSpec.midCm` est requis (pas d'optionnel, compatible `exactOptionalPropertyTypes`) ; `plantState.test.ts` construit ses specs avec `branches: []` et ne dépend donc pas de `midCm`. `ripenAtS` de la spec est relatif à la création du plant ; `plantModule` le convertit en absolu (`simTimeS + ripenAtS`) et `tomatoesFromSpec(spec, 0)` produit l'état initial cohérent. `Vec3` est un tuple readonly : `fakePhysics` copie explicitement les trois composantes, `rapierPhysics` passe par `worldToThree` / `threeToWorld`. Tous les imports de types utilisent `import type` ; `RAPIER` (valeur) et les types `Collider`, `RigidBody`, `World` sont importés séparément.

**Points d'attention à l'exécution :** `tsc` ne passe qu'après la Task 9 (import dynamique de `./rapierPhysics`) ; Vitest passe dès la Task 5. Le chunk Rapier pèse ≈ 2,9 Mo (WASM base64) : acceptable pour une démo locale, l'avertissement de Vite n'est pas une erreur. Sous SwiftShader (Playwright), `RAPIER.init()` prend moins d'une seconde ; la capture attend `registry.plantSpec` avec un délai de 30 s pour être robuste. Si Rapier fait rebondir une tomate hors du panier (restitution 0,15, parois 10 cm), c'est le comportement voulu par la spec : `missed`.
