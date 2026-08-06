/**
 * GALAXY_SHARED_PARAM_KEYS — every flat field name that lives on
 * `GalaxySharedParams`, the mirror of `GALAXY_LEGACY_PARAM_KEYS`. Used by
 * `migrateGalaxyParamsWire` to route a pre-v4 preset's flat `p.<key>` into
 * the right bag and drop anything neither set names (an unknown key, or
 * `dust`/`starFormation` — see that migrator's header).
 */
import type { GalaxySharedParams } from '../../../../src/@types/galaxy/GalaxySharedParams';

export const GALAXY_SHARED_PARAM_KEYS: ReadonlySet<keyof GalaxySharedParams> = new Set([
  'radius',
  'bulgeSize',
  'bulgeFalloff',
  'diskThickness',
  'diskScaleLenFrac',
  'irregularity',
  'armCount',
  'armWinding',
  'armFalloff',
  'armEdgeVar',
  'armClump',
  'armWave',
  'armAges',
  'armStart',
  'barStrength',
  'barAngleDeg',
  'youngStars',
  'metallicity',
  'warpStrength',
  'warpTwist',
  'warpStart',
  'seed',
  'asymSeed',
  'clumpSeed',
  'waveSeed',
]);
