/** Visibility window in (camera distance / sphere radius): ramps in over 1.2→2, out over 12→40. */

import type { FadeBand } from '../../@types/math/FadeBand';

export const LIGHT_TIME_APPROACH_BAND: FadeBand = { fullAt: 2.0, goneAt: 1.2 };
export const LIGHT_TIME_RECEDE_BAND: FadeBand = { fullAt: 12, goneAt: 40 };
