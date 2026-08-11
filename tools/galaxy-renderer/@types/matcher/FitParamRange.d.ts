/**
 * FitParamRange — one optimisable knob in a `FitPlan`: the `GalaxyParams` key
 * to vary, and the inclusive `[lo, hi]` bounds `autoFit`'s coordinate descent
 * clamps trial values to. A plain tuple, not an object, since `fitPlan`'s
 * per-category tables read as literal arrays. `key` is `NumericGalaxyParamKey`
 * — narrowed to numeric fields only, see that type's own docblock for why.
 */

import type { NumericGalaxyParamKey } from './NumericGalaxyParamKey';

export type FitParamRange = readonly [key: NumericGalaxyParamKey, lo: number, hi: number];
