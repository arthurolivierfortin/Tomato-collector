import type { ActionResult, SimAction, SimEvent } from '@tomato/shared';
import type { PlantSpec } from '../plant/generatePlant';
import type { SceneHandle } from '../three/createScene';
import type { Signals } from './signals';
import type { WorldStore } from './store';

/** Ce que les modules se partagent sans se connaître. */
export interface Registry {
  /** Spécification du plant courant, publiée par le module plant. */
  plantSpec: PlantSpec | null;
}

export interface SimContext {
  store: WorldStore;
  signals: Signals;
  /** Événements destinés au serveur (ripe_detected, tomato_landed, ...). */
  emitEvent: (event: SimEvent) => void;
  /** null dans les tests sans navigateur. */
  scene: SceneHandle | null;
  registry: Registry;
}

/** Options de traitement d'une action (issue #21). */
export interface HandleOptions {
  /** true : pose finale appliquée d'un coup, résultat immédiat (contrôles locaux, mise en place des tests). */
  instant: boolean;
}

export interface SimModule {
  name: string;
  init(ctx: SimContext): void | Promise<void>;
  /** Appelé à chaque frame avec le dt SIM (déjà mis à l'échelle, 0 si pause). */
  update?(dtSimS: number, ctx: SimContext): void;
  /**
   * Retourne null si l'action n'est pas de son ressort.
   * Une promesse = mouvement animé : elle se résout à la fin du déplacement.
   * Avec `opts.instant`, le module DOIT répondre de façon synchrone.
   */
  handle?(action: SimAction, ctx: SimContext, opts?: HandleOptions): ActionResult | Promise<ActionResult> | null;
}
