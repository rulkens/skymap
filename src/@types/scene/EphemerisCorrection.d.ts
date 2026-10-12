/**
 * EphemerisCorrection — one body's fitted `Horizons − model` correction, per space it corrects.
 * `outside` is the row's own out-of-span policy: `'hold'` clamps to the edge value (planets),
 * `'off'` applies nothing outside the fitted span.
 */

import type { CorrectionSeries } from './CorrectionSeries';

export type EphemerisCorrection = {
  readonly outside: 'hold' | 'off';
  /** 1 channel, rad: added to the propagated mean anomaly before Kepler is solved. */
  readonly meanAnomalyRad?: CorrectionSeries;
  /** 3 channels, equatorial km: added to the position after Kepler. */
  readonly positionKm?: CorrectionSeries;
};
