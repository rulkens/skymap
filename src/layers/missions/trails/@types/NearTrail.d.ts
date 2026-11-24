import type { MissionTrailGeometry } from './MissionTrailGeometry';

/**
 * A stay near a planet, drawn about it. The piece runs past `leaveDays` (when the craft left the
 * planet's reach) so the planet-frame picture can fade out while the Sun trail fades in.
 */
export type NearTrail = {
  readonly piece: MissionTrailGeometry;
  readonly leaveDays: number; // UT Julian date
};
