/**
 * NumericGalaxyParamKey — a `GalaxyParams` key narrowed to NUMERIC fields
 * only, pooled across BOTH `shared` and `legacy` (the two bags `GalaxyParams`
 * splits into): `autoFit` reads/writes it through a bare
 * `Record<string, number>` cast on whichever bag owns it, so a key naming a
 * non-number field (e.g. `armAges`, a `readonly number[]`) would compile
 * under a plain `keyof GalaxySharedParams` and then silently overwrite that
 * field with a scalar at runtime.
 */

import type { GalaxyLegacyParams } from '../../../../src/@types/galaxy/GalaxyLegacyParams';
import type { GalaxySharedParams } from '../../../../src/@types/galaxy/GalaxySharedParams';

type NumericKeyOf<T> = { [K in keyof T]-?: NonNullable<T[K]> extends number ? K : never }[keyof T] &
  string;

export type NumericGalaxyParamKey =
  | NumericKeyOf<GalaxySharedParams>
  | NumericKeyOf<GalaxyLegacyParams>;
