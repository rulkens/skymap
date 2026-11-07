/**
 * AntiqueTuning — the look's live knobs, set from the debug panel; the defaults
 * (`ANTIQUE_TUNING_DEFAULTS`) print the plate exactly as the constants did.
 */

import type { HexString } from '../math/HexString';
import type { OrientationFrameId } from '../camera/orientation/OrientationFrameId';
import type { AntiquePlateRow } from '../rendering/AntiquePlateRow';

export type AntiqueTuning = {
  /** Body hatch spacing, print units. */
  hatchUnits: number;
  /** Added to the hatch's terminator-parallel angle, degrees. */
  hatchAngleDeg: number;
  /** Gain on the sky's outline-colour washes (glows, structures, galaxies). */
  washGain: number;
  /** Gain on the ink's density: 2 prints every stroke as two passes of ink. */
  inkGain: number;
  /** Multiplies the sheet, sRGB. */
  paperTint: HexString;
  /** The relief's plate light above the ground, degrees. */
  reliefLightDeg: number;
  /** The sky's ruling frame: the orientation setting's, or one forced. */
  skyRulings: OrientationFrameId | 'orientation';
  rows: Record<AntiquePlateRow, boolean>;
};
