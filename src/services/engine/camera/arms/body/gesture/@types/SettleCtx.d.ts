import type { CameraTuning } from '../../../../../../../@types/camera/orbitCamera/CameraTuning';
import type { GroundRadiusLookup } from '../../../../../../../@types/camera/terrain/GroundRadiusLookup';

/** What the post-move settle reads: the floor's ground and standoff, and the tilt band's datum and tuning. */
export type SettleCtx = {
  readonly groundRadiusAtM: GroundRadiusLookup;
  readonly standoffRadii: number;
  readonly bodyRadiusM: number;
  readonly tuning: CameraTuning;
};
