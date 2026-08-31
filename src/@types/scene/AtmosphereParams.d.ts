/**
 * AtmosphereParams — one row of scattering coefficients per body with a visible
 * atmosphere; no row means no atmosphere (spec §8.1, §3's data-gate). The
 * scattering physics lives in `constituents` (see `AtmosphereConstituent`),
 * not as named per-body coefficient fields.
 *
 * Units throughout: km for radii/heights, 1/km for coefficients — the space the
 * body radii already live in, so the march needs no conversion at the
 * integration boundary. `sunIrradiance` and `exposure` are per-body look
 * dials, not physics the LUTs integrate; see `atmosphereParams.ts`.
 */

import type { Vec3 } from '../math/Vec3';
import type { AtmosphereConstituent } from './AtmosphereConstituent';

export type AtmosphereParams = {
  readonly planetRadiusKm: number; // ground sphere (Earth 6371, from SCENE_EARTH.radiusM)
  readonly atmosphereTopKm: number; // top-of-atmosphere radius (planetRadiusKm + visible-atmosphere thickness)
  readonly constituents: readonly AtmosphereConstituent[]; // ≤ MAX_CONSTITUENTS; list order is the accumulation order
  readonly groundAlbedo: Vec3; // isotropic ground bounce for the multi-scatter LUT
  readonly twilightSoftness: number; // night-limb twilight width in mu (cos-zenith) space; 0 = hard shadow (no fade)
  readonly twilightIntensity: number; // brightness gain on the twilight band; 1 = physical result, > 1 amplifies only the band
  readonly sunIrradiance: number; // solar radiance into the in-scatter integral (carried per the uniform contract; fragment-unused today — 1.0 is neutral)
  readonly exposure: number; // per-body HDR in-scatter look dial, before the shared tone-map
};
