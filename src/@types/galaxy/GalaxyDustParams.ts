/**
 * GalaxyDustParams — the analytic dust lane's flat-lane knobs plus the
 * filament/bubble network layered on top (`network`, see
 * `GalaxyDustNetworkParams`).
 *
 * `tau`: central face-on V-band optical depth (measured ~0.5–1 for spirals;
 * Xilouris et al. 1999, De Geyter et al. 2014 CALIFA mean 0.76±0.6).
 * `scaleLenRatio`: dust/stellar-light radial scale-length ratio (measured
 * 1.4–1.75). `heightRatio`: dust/stellar vertical sigma ratio (measured
 * 0.25–0.75; the Milky Way's own is ~0.35).
 */
import type { GalaxyDustNetworkParams } from './GalaxyDustNetworkParams';

export type GalaxyDustParams = {
  readonly tau: number;
  readonly scaleLenRatio: number;
  readonly heightRatio: number;
  readonly network: GalaxyDustNetworkParams;
};
