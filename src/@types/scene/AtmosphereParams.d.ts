/**
 * AtmosphereParams — the per-body physical constants the atmosphere-shell
 * renderer integrates to produce sky/limb scattering (spec §8.1). This is
 * *data*, not code: one immutable row of scattering coefficients per body that
 * has a visible atmosphere. Bodies without one (Moon, gas giants) simply have no
 * row (spec §3's data-gate).
 *
 * ### Units and frame
 *
 * All coefficients are per-kilometre (1/km) and all radii/heights are in
 * kilometres, matching the radiometric convention of Bruneton & Neyret's
 * "Precomputed Atmospheric Scattering" (2008) and Hillaire's "A Scalable and
 * Production Ready Sky and Atmosphere Rendering Technique" (2020) — the
 * reference implementations these constants come from. Scattering is split into
 * Rayleigh (per-channel, molecular), Mie (per-channel aerosol — grey for every
 * body so far, but Pluto's sub-micron tholin haze scatters blue preferentially,
 * a genuinely wavelength-dependent Mie effect a scalar cannot express), and
 * ozone (per-channel absorption, no scattering). Keeping the units uniform (km, 1/km)
 * lets the renderer march the light path in the same space the body radii live
 * in, with no unit conversion at the integration boundary.
 *
 * The two trailing fields (`sunIrradiance`, `exposure`) are the exception: they
 * are per-body RADIOMETRIC look dials the shell draw packs each frame, not
 * physics the LUTs integrate. They ride this row so a new atmosphere body carries
 * its own look in one place; see `atmosphereParams.ts`'s header for the
 * physics-vs-look split and the eye-tuning rationale.
 */

import type { Vec3 } from '../math/Vec3';

export type AtmosphereParams = {
  readonly planetRadiusKm: number; // ground sphere (Earth 6371, matching SCENE_EARTH.radiusKm)
  readonly atmosphereTopKm: number; // top-of-atmosphere radius (planetRadiusKm + visible-atmosphere thickness)
  readonly rayleighScatter: Vec3; // per-channel Rayleigh scattering coefficient, 1/km
  readonly rayleighScaleHeightKm: number; // exponential density falloff
  readonly mieScatter: Vec3; // per-channel Mie scattering coefficient, 1/km (grey for most bodies)
  readonly mieAbsorption: number; // grey Mie absorption coefficient, 1/km
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
