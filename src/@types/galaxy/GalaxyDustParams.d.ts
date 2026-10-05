/**
 * GalaxyDustParams — a `GalaxyFieldTuning` section: the dust disc's shape
 * knobs, the arm lane's own width/contrast, and the volumetric particle
 * cloud that renders all of it (`cloud`, see `GalaxyDustCloudParams`). No
 * separate smooth analytic tier exists: `tau` below is the galaxy's ENTIRE
 * measured optical depth. `tau`/`scaleLenRatio`/`heightRatio` literature is
 * in `docs/research/milky-way/dust.md`.
 */
import type { GalaxyDustCloudParams } from './GalaxyDustCloudParams';

export type GalaxyDustParams = {
  /** Master toggle for the whole tier's shader loop (the particle cloud — see `GalaxyDustCloudParams`). */
  readonly enabled: boolean;
  /** Central face-on V-band optical depth. */
  readonly tau: number;
  /** Dust/stellar-light radial scale-length ratio. */
  readonly scaleLenRatio: number;
  /** Dust/stellar vertical sigma ratio. */
  readonly heightRatio: number;
  /** Total-to-selective extinction R_V = A_V / E(B-V), the CCM89 extinction LAW's one free parameter (see `dustExtinctionRgb`) — diffuse Milky Way ISM ~3.1, dense clouds up to ~5.5 (greyer). */
  readonly rV: number;
  /**
   * A LOOK knob, not a grain property — CCM89's R_V couples dimming and
   * colour through one grain property, capping the blue/red tau spread even
   * at the R_V floor. `redness` stretches per-channel extinction about its
   * GREEN anchor (`stretchExtinctionChroma`) without extra dimming: 1 is
   * exactly physical, >1 exaggerates reddening, <1 desaturates toward grey.
   */
  readonly redness: number;
  /** The 3D particle cloud that renders ALL of `tau` — see `GalaxyDustCloudParams`. */
  readonly cloud: GalaxyDustCloudParams;
};
