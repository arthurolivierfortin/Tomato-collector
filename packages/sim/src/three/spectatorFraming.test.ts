import { describe, expect, it } from 'vitest';
import { Vector3 } from 'three';
import type { Vec3 } from '@tomato/shared';
import { vlen, vsub } from '@tomato/shared';
import {
  attachFraming, createFramingMove, FRAMING_TRANSITION_S, SPECTATOR_FRAMINGS, type Framing, type FramingScene,
} from './spectatorFraming';

/** Avant-bras (coude → poignet) et trajet d'approche de l'épisode 2026-09-18T20-16-54-341Z-t1. */
const ELBOW_AT_CUT: Vec3 = [60, -30, 75];
const WRIST_AT_CUT: Vec3 = [14, -3, 62];
const APPROACH_FROM: Vec3 = [38, -8, 62];
const APPROACH_TO: Vec3 = WRIST_AT_CUT;
/** Cadrage d'avant l'issue #42, gardé comme repère de comparaison. */
const OLD_FRAMING: Framing = { eyeCm: [150, -170, 95], targetCm: [15, -10, 35] };

const unit = (v: Vec3): Vec3 => {
  const l = vlen(v);
  return [v[0] / l, v[1] / l, v[2] / l];
};
const dot = (a: Vec3, b: Vec3): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

/**
 * Fraction de la longueur d'un segment qui survit à la projection, vue depuis `framing` : 1 quand le
 * segment est perpendiculaire à la ligne de visée, 0 quand il est vu bout par bout. C'est **la**
 * règle de choix du cadrage spectateur (issue #42) : un avant-bras vu bout par bout se réduit à son
 * coude, et le mouvement des lames ne se lit plus à l'écran.
 */
function visibleFraction(framing: Framing, fromCm: Vec3, toCm: Vec3): number {
  const sight = unit(vsub(framing.targetCm, framing.eyeCm));
  const segment = unit(vsub(toCm, fromCm));
  return Math.sqrt(Math.max(0, 1 - dot(sight, segment) ** 2));
}

function fakeScene(): FramingScene & { frame(dtS: number): void; frames: number; updates: number } {
  const callbacks = new Set<(dtS: number) => void>();
  const scene = {
    camera: { position: new Vector3() },
    controls: {
      target: new Vector3(),
      update: (): void => {
        scene.updates += 1;
      },
    },
    onFrame: (cb: (dtS: number) => void) => {
      callbacks.add(cb);
      scene.frames += 1;
      return () => callbacks.delete(cb);
    },
    frame: (dtS: number): void => {
      for (const cb of callbacks) cb(dtS);
    },
    frames: 0,
    updates: 0,
  };
  return scene;
}

describe('cadrages spectateur', () => {
  it('montre l’avant-bras et l’approche en travers de la visée, là où l’ancien cadrage les écrasait', () => {
    for (const framing of [SPECTATOR_FRAMINGS.wide, SPECTATOR_FRAMINGS.cut]) {
      expect(visibleFraction(framing, ELBOW_AT_CUT, WRIST_AT_CUT)).toBeGreaterThan(0.5);
      expect(visibleFraction(framing, APPROACH_FROM, APPROACH_TO)).toBeGreaterThan(0.5);
    }
    expect(visibleFraction(OLD_FRAMING, ELBOW_AT_CUT, WRIST_AT_CUT)).toBeLessThan(0.35);
  });

  it('regarde la scène de face et de la droite du plant, le cadrage de coupe étant le plus près', () => {
    for (const framing of [SPECTATOR_FRAMINGS.wide, SPECTATOR_FRAMINGS.cut]) {
      expect(framing.eyeCm[0]).toBeGreaterThan(0);
      expect(framing.eyeCm[1]).toBeLessThan(-80);
      expect(framing.eyeCm[2]).toBeGreaterThan(40);
    }
    const distance = (f: Framing): number => vlen(vsub(f.eyeCm, f.targetCm));
    expect(distance(SPECTATOR_FRAMINGS.cut)).toBeLessThan(distance(SPECTATOR_FRAMINGS.wide));
    // Le cadrage de coupe vise la zone de coupe (~60 cm), le large vise le milieu de la scène.
    expect(SPECTATOR_FRAMINGS.cut.targetCm[2]).toBeGreaterThan(SPECTATOR_FRAMINGS.wide.targetCm[2]);
  });
});

describe('createFramingMove', () => {
  it('part du premier cadrage, arrive au second après la durée demandée', () => {
    const move = createFramingMove(SPECTATOR_FRAMINGS.wide, SPECTATOR_FRAMINGS.cut, 0.8);
    expect(move.value()).toEqual(SPECTATOR_FRAMINGS.wide);
    expect(move.done).toBe(false);
    const half = move.step(0.4);
    expect(half.eyeCm[0]).toBeCloseTo((SPECTATOR_FRAMINGS.wide.eyeCm[0] + SPECTATOR_FRAMINGS.cut.eyeCm[0]) / 2, 5);
    expect(half.targetCm[2]).toBeCloseTo((SPECTATOR_FRAMINGS.wide.targetCm[2] + SPECTATOR_FRAMINGS.cut.targetCm[2]) / 2, 5);
    expect(move.done).toBe(false);
    expect(move.step(0.4)).toEqual(SPECTATOR_FRAMINGS.cut);
    expect(move.done).toBe(true);
  });

  it('se termine tout de suite entre deux cadrages identiques', () => {
    const move = createFramingMove(SPECTATOR_FRAMINGS.cut, SPECTATOR_FRAMINGS.cut, 0.8);
    expect(move.step(0)).toEqual(SPECTATOR_FRAMINGS.cut);
    expect(move.done).toBe(true);
  });
});

describe('attachFraming', () => {
  it('pose le cadrage large au montage, en repère Three (x, z, −y)', () => {
    const scene = fakeScene();
    const framing = attachFraming(scene);
    expect(framing.current()).toBe('wide');
    const { eyeCm, targetCm } = SPECTATOR_FRAMINGS.wide;
    expect([scene.camera.position.x, scene.camera.position.y, scene.camera.position.z]).toEqual([eyeCm[0], eyeCm[2], -eyeCm[1]]);
    expect([scene.controls.target.x, scene.controls.target.y, scene.controls.target.z]).toEqual([targetCm[0], targetCm[2], -targetCm[1]]);
  });

  it('bascule vers la coupe en une transition douce, pas d’un coup', () => {
    const scene = fakeScene();
    const framing = attachFraming(scene);
    framing.toggle();
    expect(framing.current()).toBe('cut');
    scene.frame(FRAMING_TRANSITION_S / 2);
    expect(scene.camera.position.x).toBeGreaterThan(SPECTATOR_FRAMINGS.cut.eyeCm[0]);
    expect(scene.camera.position.x).toBeLessThan(SPECTATOR_FRAMINGS.wide.eyeCm[0]);
    scene.frame(FRAMING_TRANSITION_S / 2);
    expect(scene.camera.position.x).toBeCloseTo(SPECTATOR_FRAMINGS.cut.eyeCm[0], 5);
    expect(scene.controls.target.y).toBeCloseTo(SPECTATOR_FRAMINGS.cut.targetCm[2], 5);
  });

  it('revient au cadrage large au second appel, et se détache proprement', () => {
    const scene = fakeScene();
    const framing = attachFraming(scene);
    framing.toggle();
    scene.frame(FRAMING_TRANSITION_S);
    framing.toggle();
    expect(framing.current()).toBe('wide');
    scene.frame(FRAMING_TRANSITION_S);
    expect(scene.camera.position.x).toBeCloseTo(SPECTATOR_FRAMINGS.wide.eyeCm[0], 5);
    framing.dispose();
    const settled = scene.camera.position.x;
    framing.toggle();
    scene.frame(FRAMING_TRANSITION_S);
    expect(scene.camera.position.x).toBe(settled);
  });
});
