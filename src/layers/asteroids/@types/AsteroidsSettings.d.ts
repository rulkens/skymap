import type { AsteroidClass } from '../../../@types/asteroids/AsteroidClass';
import type { DataItemSettings } from '../../../@types/settings/DataItemSettings';

/** AsteroidsSettings — the master switch, one switch per class, and the Layer's own flux multiplier. */
export type AsteroidsSettings = {
  enabled: boolean;
  /** `items`, not a bare boolean map: the generic `setVisibility` writes `items[cls].enabled`. */
  items: Record<AsteroidClass, DataItemSettings>;
  /** Independent of the stars' slider (owner ruling); 1 = the calibrated flux. */
  brightness: number;
};
