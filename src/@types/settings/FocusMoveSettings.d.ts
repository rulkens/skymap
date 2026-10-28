/**
 * FocusMoveSettings — the `settings.focusMoves` cluster: which style a focus
 * move flies, and both styles' tuning. This is the Intent; `resolveFocusMotion`
 * freezes it into a `FocusMotion` at dispatch. Only `style` persists.
 */

import type { FocusMoveStyle } from '../camera/FocusMoveStyle';
import type { GeodesicTuning } from '../camera/GeodesicTuning';

export type FocusMoveSettings = {
  readonly style: FocusMoveStyle;
  /** Also drives the planet follow-approach and Home, which stay Eased under either style. */
  readonly eased: { readonly durationMs: number };
  readonly geodesic: GeodesicTuning;
};
