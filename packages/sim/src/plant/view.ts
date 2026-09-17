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
