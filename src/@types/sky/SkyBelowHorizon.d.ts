import type { SkyLook } from './SkyLook';

/** The last search's target is below the horizon: what the HUD offers about its rise (R12). */
export type SkyBelowHorizon = Pick<
  Extract<SkyLook, { kind: 'belowHorizon' }>,
  'riseAt' | 'neverRises'
>;
