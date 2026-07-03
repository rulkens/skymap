/**
 * FitParamRange — one optimisable knob in a `FitPlan`: the `GalaxyParams` key
 * to vary, and the inclusive `[lo, hi]` bounds `autoFit`'s coordinate descent
 * clamps trial values to. A plain tuple (not an object) because `fitPlan`'s
 * per-category tables read as literal arrays ported verbatim from
 * galaxy-matcher.js:141-157 — an object shape would just add punctuation.
 */

import type { GalaxyParams } from '../model/GalaxyParams';

export type FitParamRange = readonly [key: keyof GalaxyParams & string, lo: number, hi: number];
