import type { SampledTrailGeometry } from './SampledTrailGeometry';

/**
 * A stay near a planet, drawn about it. The piece runs past `leaveDays` (when the body left the
 * planet's reach) so the planet-frame picture can fade out while the Sun trail fades back in.
 */
export type NearTrail = {
  readonly piece: SampledTrailGeometry;
  readonly leaveDays: number; // UT Julian date
};
