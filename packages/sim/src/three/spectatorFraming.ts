import { vlen, vsub } from '@tomato/shared';
import type { Vec3 } from '@tomato/shared';
import { createTween, type Tween } from '../core/animation';
import { threeToWorld, worldToThree } from './frame';

/** Un cadrage de la vue spectateur : d'où l'on regarde, et ce que l'on vise (monde, cm). */
export interface Framing {
  readonly eyeCm: Vec3;
  readonly targetCm: Vec3;
}

/**
 * Cadrage par défaut (issue #42).
 *
 * L'ancien œil, (150, −170, 95) visant (15, −10, 35), regardait le bras presque bout par bout :
 * l'avant-bras (coude (60, −30, 75) → poignet (14, −3, 62) à la coupe) ne gardait que 33 % de sa
 * longueur à l'écran, si bien que les 24 cm d'approche des lames se réduisaient à quelques pixels
 * derrière le coude — « on ne voit pas les mouvements du bout du bras ». Reculer *vers la droite*,
 * comme le suggérait le retour, l'aurait refermé complètement (le bras devient une colonne, capture
 * `data/shots/pr42-3-tige-droite.png`) : c'est en tournant vers l'avant que l'avant-bras se déplie.
 *
 * L'œil retenu, mesuré sur la séquence réelle de l'épisode 2026-09-18T20-16-54-341Z-t1 : azimut
 * −66° autour de la cible, élévation 10°, à 175 cm. L'avant-bras y garde 58 % de sa longueur et
 * l'approche se lit en travers du cadre ; la cible est décalée vers le bras (x 24) pour que le coude
 * de la pose de repos, qui part loin à droite (76, −46, 70), reste dans le cadre.
 */
export const WIDE_FRAMING: Framing = { eyeCm: [94, -165, 64], targetCm: [24, -8, 34] };

/**
 * Cadrage rapproché sur la zone de coupe (touche `k`) : même axe de regard, 115 cm de la cible
 * (13, −5, 42), soit les lames au tiers supérieur du cadre et le panier entier en bas — de quoi
 * suivre l'ouverture des lames, la coupe et la chute. Le socle du bras en sort, c'est assumé : le
 * cadrage large est là pour montrer le robot entier.
 */
export const CUT_FRAMING: Framing = { eyeCm: [59, -109, 58], targetCm: [13, -5, 42] };

export type FramingName = 'wide' | 'cut';

export const SPECTATOR_FRAMINGS: Record<FramingName, Framing> = { wide: WIDE_FRAMING, cut: CUT_FRAMING };

/** Durée de la transition entre deux cadrages, en secondes réelles (elle vit hors du temps sim). */
export const FRAMING_TRANSITION_S = 0.8;

export type FramingMove = Tween<Framing>;

/** Déplacement continu d'un cadrage à l'autre : œil et cible arrivent ensemble, à `durationS`. */
export function createFramingMove(from: Framing, to: Framing, durationS: number = FRAMING_TRANSITION_S): FramingMove {
  const speed = (a: Vec3, b: Vec3): number => (durationS > 0 ? vlen(vsub(b, a)) / durationS : 0);
  const eye = createTween(from.eyeCm, to.eyeCm, speed(from.eyeCm, to.eyeCm));
  const target = createTween(from.targetCm, to.targetCm, speed(from.targetCm, to.targetCm));
  const value = (): Framing => ({ eyeCm: eye.value(), targetCm: target.value() });
  return {
    durationS: Math.max(eye.durationS, target.durationS),
    get done() {
      return eye.done && target.done;
    },
    value,
    step(dtS) {
      eye.step(dtS);
      target.step(dtS);
      return value();
    },
  };
}

/** Ce que `attachFraming` demande à la scène : de quoi poser la caméra et être rappelé à chaque frame. */
export interface FramingScene {
  camera: { position: { copy(v: { x: number; y: number; z: number }): unknown; x: number; y: number; z: number } };
  controls: { target: { copy(v: { x: number; y: number; z: number }): unknown; x: number; y: number; z: number }; update(): unknown };
  /** Rappel à chaque frame avec le dt **réel** : la transition joue même simulation en pause. */
  onFrame(cb: (dtS: number) => void): () => void;
}

export interface SpectatorFraming {
  current(): FramingName;
  /** Vise ce cadrage, en transition douce depuis la position réelle de la caméra. */
  set(name: FramingName): void;
  /** Passe à l'autre cadrage : large ↔ coupe. */
  toggle(): void;
  dispose(): void;
}

/** Pose le cadrage initial sur la scène et anime les changements ; à détacher avec `dispose`. */
export function attachFraming(scene: FramingScene, initial: FramingName = 'wide'): SpectatorFraming {
  let current: FramingName = initial;
  let move: FramingMove | null = null;

  const apply = (framing: Framing): void => {
    scene.camera.position.copy(worldToThree(framing.eyeCm));
    scene.controls.target.copy(worldToThree(framing.targetCm));
    scene.controls.update();
  };
  /** Cadrage réellement à l'écran : relu sur la caméra, qui a pu être orbitée à la souris. */
  const shown = (): Framing => ({
    eyeCm: threeToWorld(scene.camera.position),
    targetCm: threeToWorld(scene.controls.target),
  });

  apply(SPECTATOR_FRAMINGS[current]);
  const stop = scene.onFrame((dtS) => {
    if (move === null) return;
    apply(move.step(dtS));
    if (move.done) move = null;
  });

  const set = (name: FramingName): void => {
    current = name;
    move = createFramingMove(shown(), SPECTATOR_FRAMINGS[name]);
  };
  return {
    current: () => current,
    set,
    toggle: () => set(current === 'wide' ? 'cut' : 'wide'),
    dispose: () => {
      move = null;
      stop();
    },
  };
}
