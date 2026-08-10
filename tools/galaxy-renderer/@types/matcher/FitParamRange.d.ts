/**
 * FitParamRange — one optimisable knob in a `FitPlan`: the `GalaxyParams` key
 * to vary, and the inclusive `[lo, hi]` bounds `autoFit`'s coordinate descent
 * clamps trial values to. A plain tuple (not an object) because `fitPlan`'s
 * per-category tables read as literal arrays ported verbatim from
 * the spike's `galaxy-matcher.js` — an object shape would just add punctuation.
 *
 * `key` is `NumericGalaxyParamKey` — narrowed to NUMERIC fields only, see
 * that type's own docblock for why (this is exactly the bug `spriteDust`
 * replaced `dust` for).
 */

import type { NumericGalaxyParamKey } from './NumericGalaxyParamKey';

export type FitParamRange = readonly [key: NumericGalaxyParamKey, lo: number, hi: number];
