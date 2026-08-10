/**
 * GalaxyParams — the full knob surface for the GPU galaxy-generation passes,
 * split by consumer: `shared` feeds `describeGalaxy` (both v1 and v2 read the
 * resulting `GalaxyDescription`); `legacy` is read directly by v1's sprite
 * generator alone and dies with `galaxyGenerator/v1/`. Every field is
 * optional; defaults are applied at each field's own point of use (see
 * `GalaxySharedParams`/`GalaxyLegacyParams`), not centralized here.
 */
import type { GalaxyLegacyParams } from './GalaxyLegacyParams';
import type { GalaxySharedParams } from './GalaxySharedParams';

export type GalaxyParams = {
  /** Hubble type: 'Sa'..'Sc', 'SBa'..'SBc', 'E0'..'E7', 'S0', 'Irr'. Stays bare — every branch keys off it first. */
  readonly type: string;
  readonly shared: GalaxySharedParams;
  /** v1 sprite generator only — dies with `galaxyGenerator/v1/`. */
  readonly legacy?: GalaxyLegacyParams;
};
