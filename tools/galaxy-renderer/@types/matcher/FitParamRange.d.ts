/**
 * FitParamRange — one optimisable knob in a `FitPlan`: the `GalaxyParams` key
 * to vary, and the inclusive `[lo, hi]` bounds `autoFit`'s coordinate descent
 * clamps trial values to. A plain tuple (not an object) because `fitPlan`'s
 * per-category tables read as literal arrays ported verbatim from
 * the spike's `galaxy-matcher.js` — an object shape would just add punctuation.
 *
 * `key` is narrowed to NUMERIC fields only: `autoFit` reads/writes it through
 * a bare `Record<string, number>` cast, so a key naming a non-number field
 * (e.g. `dust`, a nested `GalaxyDustParams` object) would compile under a
 * plain `keyof GalaxyParams` and then silently overwrite that object with a
 * scalar at runtime — this is exactly the bug `spriteDust` replaced `dust`
 * for below.
 */

import type { GalaxyParams } from '../../../../src/@types/galaxy/GalaxyParams';

type NumericGalaxyParamKey = {
  [K in keyof GalaxyParams]-?: NonNullable<GalaxyParams[K]> extends number ? K : never;
}[keyof GalaxyParams] &
  string;

export type FitParamRange = readonly [key: NumericGalaxyParamKey, lo: number, hi: number];
