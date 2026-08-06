/**
 * FitParamRange — one optimisable knob in a `FitPlan`: the `GalaxyParams` key
 * to vary, and the inclusive `[lo, hi]` bounds `autoFit`'s coordinate descent
 * clamps trial values to. A plain tuple (not an object) because `fitPlan`'s
 * per-category tables read as literal arrays ported verbatim from
 * the spike's `galaxy-matcher.js` — an object shape would just add punctuation.
 *
 * `key` is narrowed to NUMERIC fields only, pooled across BOTH `shared` and
 * `legacy` (the two bags `GalaxyParams` split into): `autoFit` reads/writes
 * it through a bare `Record<string, number>` cast on whichever bag owns it,
 * so a key naming a non-number field (e.g. `armAges`, a `readonly number[]`)
 * would compile under a plain `keyof GalaxySharedParams` and then silently
 * overwrite that field with a scalar at runtime — this is exactly the bug
 * `spriteDust` replaced `dust` for below.
 */

import type { GalaxyLegacyParams } from '../../../../src/@types/galaxy/GalaxyLegacyParams';
import type { GalaxySharedParams } from '../../../../src/@types/galaxy/GalaxySharedParams';

type NumericKeyOf<T> = { [K in keyof T]-?: NonNullable<T[K]> extends number ? K : never }[keyof T] &
  string;

export type NumericGalaxyParamKey =
  | NumericKeyOf<GalaxySharedParams>
  | NumericKeyOf<GalaxyLegacyParams>;

export type FitParamRange = readonly [key: NumericGalaxyParamKey, lo: number, hi: number];
