/**
 * GALAXY_SHARED_PARAM_KEYS — every flat field name that lives on
 * `GalaxySharedParams`, the mirror of `GALAXY_LEGACY_PARAM_KEYS`. Used by
 * `migrateGalaxyParamsWire` to route a pre-v4 preset's flat `p.<key>` into
 * the right bag and drop anything neither set names (an unknown key, or
 * `dust`/`starFormation` — see that migrator's header).
 */
import type { GalaxySharedParams } from '../../../../src/@types/galaxy/GalaxySharedParams';

// `satisfies Record<keyof GalaxySharedParams, true>` makes a field this map
// forgets (or misspells) a compile error, not a silent migration hole.
const GALAXY_SHARED_PARAM_KEY_MAP = {
  radius: true,
  bulgeSize: true,
  bulgeFalloff: true,
  diskThickness: true,
  diskScaleLenFrac: true,
  irregularity: true,
  armCount: true,
  armWinding: true,
  armFalloff: true,
  armEdgeVar: true,
  armClump: true,
  armWave: true,
  armAges: true,
  armStart: true,
  barStrength: true,
  barAngleDeg: true,
  youngStars: true,
  metallicity: true,
  warpStrength: true,
  warpTwist: true,
  warpStart: true,
  seed: true,
  asymSeed: true,
  clumpSeed: true,
  waveSeed: true,
} satisfies Record<keyof GalaxySharedParams, true>;

export const GALAXY_SHARED_PARAM_KEYS: ReadonlySet<keyof GalaxySharedParams> = new Set(
  Object.keys(GALAXY_SHARED_PARAM_KEY_MAP) as (keyof GalaxySharedParams)[],
);
