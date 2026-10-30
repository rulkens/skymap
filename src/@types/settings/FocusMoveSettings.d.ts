/**
 * FocusMoveSettings — the `settings.focusMoves` cluster: which style a focus
 * move flies, and both styles' tuning. This is the Intent; `resolveFocusMotion`
 * freezes it into a `FocusMotion` at dispatch.
 */

import type { FocusMoveStyle } from '../camera/FocusMoveStyle';
import type { GeodesicTuning } from '../camera/GeodesicTuning';

export type FocusMoveSettings = {
  readonly style: FocusMoveStyle;
  /** Also times the follow approach, which owns a move to a moving body under Eased. */
  readonly eased: { readonly durationMs: number };
  readonly geodesic: GeodesicTuning;
};
