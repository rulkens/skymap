/**
 * GalaxyDustParams — a `GalaxyFieldTuning` section: the dust disc's shape
 * knobs, the arm lane's own width/contrast, the volumetric particle cloud
 * that renders all of it (`cloud`, see `GalaxyDustCloudParams`), and the
 * tier's master toggle (`enabled`, absorbed from the deleted
 * `GalaxyDustTuning` — one bag for the tier instead of two). No separate
 * smooth analytic tier exists: `tau` below is the galaxy's ENTIRE measured
 * optical depth, carried in full by the particle cloud.
 *
 * `tau`: central face-on V-band optical depth (measured ~0.5–1 for spirals;
 * Xilouris et al. 1999, De Geyter et al. 2014 CALIFA mean 0.76±0.6).
 * `scaleLenRatio`: dust/stellar-light radial scale-length ratio (measured
 * 1.4–1.75). `heightRatio`: dust/stellar vertical sigma ratio (measured
 * 0.25–0.75; the Milky Way's own is ~0.35).
 * `rV`: total-to-selective extinction R_V = A_V / E(B-V), the CCM89
 * extinction LAW's one free parameter (see `dustExtinctionRgb`) — diffuse
 * Milky Way ISM ~3.1, dense molecular clouds up to ~5.5 (greyer), SMC/
 * starburst sightlines ~2–2.5 (more strongly reddening).
 */
import type { GalaxyDustCloudParams } from './GalaxyDustCloudParams';

export type GalaxyDustParams = {
  /** Master toggle for the whole tier's shader loop (the particle cloud — see `GalaxyDustCloudParams`). */
  readonly enabled: boolean;
  readonly tau: number;
  readonly scaleLenRatio: number;
  readonly heightRatio: number;
  readonly rV: number;
  /** The 3D particle cloud that renders ALL of `tau` — see `GalaxyDustCloudParams`. */
  readonly cloud: GalaxyDustCloudParams;
};
