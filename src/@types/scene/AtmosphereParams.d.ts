/**
 * AtmosphereParams — one row of scattering coefficients per body with a visible
 * atmosphere; no row means no atmosphere (spec §8.1, §3's data-gate).
 *
 * Units throughout: km for radii/heights, 1/km for coefficients — the space the
 * body radii already live in, so the march needs no conversion at the integration
 * boundary. Values follow Bruneton & Neyret (2008) and Hillaire (2020), the
 * reference implementations they come from. `sunIrradiance` and `exposure` are
 * per-body look dials, not physics the LUTs integrate; see `atmosphereParams.ts`.
 */

import type { Vec3 } from '../math/Vec3';
import type { AtmosphereConstituent } from './AtmosphereConstituent';

export type AtmosphereParams = {
  readonly planetRadiusKm: number; // ground sphere (Earth 6371, matching SCENE_EARTH.radiusKm)
  readonly atmosphereTopKm: number; // top-of-atmosphere radius (planetRadiusKm + visible-atmosphere thickness)
  readonly constituents: readonly AtmosphereConstituent[]; // ≤ MAX_CONSTITUENTS; list order is the accumulation order
  readonly rayleighScatter: Vec3; // per-channel Rayleigh scattering coefficient, 1/km
  readonly rayleighScaleHeightKm: number; // exponential density falloff
  readonly mieScatter: Vec3; // per-channel Mie scattering, 1/km — grey for most bodies, but Pluto's sub-micron tholin haze scatters blue preferentially, which a scalar cannot express
  readonly mieAbsorption: number; // Mie absorption, 1/km — stays scalar; only the scattering side is wavelength-dependent here
  readonly mieScaleHeightKm: number; // exponential aerosol density falloff
  readonly miePhaseG: number; // Henyey-Greenstein asymmetry g (Earth ≈ 0.8)
  readonly ozoneAbsorption: Vec3; // per-channel ozone absorption, 1/km
  readonly ozoneCenterKm: number; // tent-profile centre altitude
  readonly ozoneWidthKm: number; // tent-profile half-width
  readonly groundAlbedo: Vec3; // isotropic ground bounce for the multi-scatter LUT
  readonly twilightSoftness: number; // night-limb twilight width in mu (cos-zenith) space; 0 = hard shadow (no fade)
  readonly twilightIntensity: number; // brightness gain on the twilight band; 1 = physical result, > 1 amplifies only the band
  readonly sunIrradiance: number; // solar radiance into the in-scatter integral (carried per the uniform contract; fragment-unused today — 1.0 is neutral)
  readonly exposure: number; // per-body HDR in-scatter look dial, before the shared tone-map
};
