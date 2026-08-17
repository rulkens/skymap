/**
 * AtmosphereConstituent — one scattering/absorbing species in a body's atmosphere.
 *
 * The roles are no longer positional: before this type, Rayleigh was scatter-only
 * by construction and ozone absorb-only by construction, and only Mie could do
 * both. A constituent that scatters AND absorbs is now one row setting both
 * vectors — what a haze deck or a UV absorber needs. Coefficients are 1/km at the
 * ground, where the profile's density is 1.
 */

import type { Vec3 } from '../math/Vec3';
import type { DensityProfile } from './DensityProfile';
import type { PhaseFunction } from './PhaseFunction';

export type AtmosphereConstituent = {
  readonly scatter: Vec3;
  readonly absorb: Vec3;
  readonly profile: DensityProfile;
  readonly phase: PhaseFunction;
};
