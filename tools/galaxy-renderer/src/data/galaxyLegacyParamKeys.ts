/**
 * GALAXY_LEGACY_PARAM_KEYS — which flat `GalaxyParams` field names live on
 * the `legacy` bag rather than `shared`, so a UI/randomizer working off a
 * flat key can route a patch to the right nested object. `GalaxySharedParams`
 * and `GalaxyLegacyParams` never share a field name, so "not in this set"
 * always means shared.
 */
import type { GalaxyLegacyParams } from '../../../../src/@types/galaxy/GalaxyLegacyParams';

export const GALAXY_LEGACY_PARAM_KEYS: ReadonlySet<keyof GalaxyLegacyParams> = new Set([
  'starCount',
  'armWidth',
  'armStrength',
  'subArms',
  'hii',
  'spriteDust',
  'dustNoise',
  'dustNoiseScale',
  'dustRing',
  'dustRingWidth',
  'dustRingStrength',
  'globularCount',
  'globularSize',
  'globularBright',
]);
