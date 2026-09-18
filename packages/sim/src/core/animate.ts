import { ok } from '@tomato/shared';
import type { ActionResult, WorldState } from '@tomato/shared';
import type { Lane } from './animation';
import type { SimContext } from './module';

/** Interpolation d'un état de départ vers un état d'arrivée, avancée frame par frame. */
export interface Motion {
  /**
   * Avance de `dtSimS` et renvoie `current` avec les seuls champs animés remplacés
   * (les autres modules continuent d'écrire les leurs pendant le mouvement).
   */
  step(dtSimS: number, current: WorldState): { state: WorldState; done: boolean };
}

export interface MotionSpec {
  /** Réducteur pur : valide et calcule la pose FINALE depuis l'état de départ. */
  compute(from: WorldState): ActionResult;
  /** Interpolation de la pose de départ vers la pose finale. */
  motion(from: WorldState, to: WorldState): Motion;
  /** Effet différé, appliqué une fois le mouvement terminé (signal `tomato_cut`). */
  onArrival?(ctx: SimContext): void;
}

export interface MotionRunner {
  /** Enfile l'action sur la file de son outil et rend la promesse résolue à la fin du mouvement. */
  start(ctx: SimContext, lane: Lane, spec: MotionSpec): Promise<ActionResult>;
  /** Pose finale appliquée d'un coup, résultat immédiat. */
  now(ctx: SimContext, spec: MotionSpec): ActionResult;
  /** À appeler depuis `update` du module, avec le dt SIM (0 en pause : l'animation est gelée). */
  update(dtSimS: number, ctx: SimContext): void;
  /** Vrai tant qu'un mouvement est en cours. */
  readonly busy: boolean;
}

type Tick = (dtSimS: number, ctx: SimContext) => boolean;

/**
 * Exécute les actions animées d'un module (issue #21) : le réducteur valide et calcule la pose finale
 * tout de suite, puis l'interpolation écrit le store à chaque frame et la promesse ne se résout
 * qu'une fois la pose finale atteinte. Une erreur du réducteur répond sans aucun mouvement.
 */
export function createMotionRunner(): MotionRunner {
  const running = new Set<Tick>();
  return {
    get busy() {
      return running.size > 0;
    },
    now(ctx, spec) {
      const r = spec.compute(ctx.store.get());
      if (!r.ok) return r;
      ctx.store.set(r.state);
      spec.onArrival?.(ctx);
      return r;
    },
    start(ctx, lane, spec) {
      return lane.run(() => {
        const from = ctx.store.get();
        const r = spec.compute(from);
        if (!r.ok) return Promise.resolve(r);
        const motion = spec.motion(from, r.state);
        return new Promise<ActionResult>((resolve) => {
          running.add((dtSimS, c) => {
            const next = motion.step(dtSimS, c.store.get());
            // En pause (dt sim = 0) rien ne bouge : on n'écrit pas le store, sinon chaque frame
            // rediffuserait un état identique au serveur et au dashboard.
            if (dtSimS <= 0 && !next.done) return false;
            c.store.set(next.state);
            if (!next.done) return false;
            spec.onArrival?.(c);
            resolve(ok(c.store.get(), r.message));
            return true;
          });
        });
      });
    },
    update(dtSimS, ctx) {
      for (const tick of [...running]) if (tick(dtSimS, ctx)) running.delete(tick);
    },
  };
}
