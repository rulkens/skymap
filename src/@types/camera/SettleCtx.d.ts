import type { CameraTuning } from './CameraTuning';
import type { GroundRadiusLookup } from './GroundRadiusLookup';

/** What the post-move settle reads: the floor's ground and standoff, and the tilt band's datum and tuning. */
export type SettleCtx = {
  readonly groundRadiusAtM: GroundRadiusLookup;
  readonly standoffRadii: number;
  readonly bodyRadiusM: number;
  readonly tuning: CameraTuning;
};
