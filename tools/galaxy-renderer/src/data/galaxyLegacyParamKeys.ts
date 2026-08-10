/**
 * GALAXY_LEGACY_PARAM_KEYS — which flat `GalaxyParams` field names live on
 * the `legacy` bag rather than `shared`, so a UI/randomizer working off a
 * flat key can route a patch to the right nested object. `GalaxySharedParams`
 * and `GalaxyLegacyParams` never share a field name, so "not in this set"
 * always means shared.
 */
import type { GalaxyLegacyParams } from '../../../../src/@types/galaxy/GalaxyLegacyParams';

// `satisfies Record<keyof GalaxyLegacyParams, true>` makes a field this map
// forgets (or misspells) a compile error, not a silent migration hole.
const GALAXY_LEGACY_PARAM_KEY_MAP = {
  starCount: true,
  armWidth: true,
  armStrength: true,
  subArms: true,
  hii: true,
  spriteDust: true,
  dustNoise: true,
  dustNoiseScale: true,
  dustRing: true,
  dustRingWidth: true,
  dustRingStrength: true,
  globularCount: true,
  globularSize: true,
  globularBright: true,
} satisfies Record<keyof GalaxyLegacyParams, true>;

export const GALAXY_LEGACY_PARAM_KEYS: ReadonlySet<keyof GalaxyLegacyParams> = new Set(
  Object.keys(GALAXY_LEGACY_PARAM_KEY_MAP) as (keyof GalaxyLegacyParams)[],
);
