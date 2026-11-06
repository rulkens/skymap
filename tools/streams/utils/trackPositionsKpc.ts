import type { Vec3 } from '../../../src/@types/math/Vec3';
import { raDecDistToEqCart } from '../../../src/utils/math/raDecDistToEqCart';
import type { GalstreamsTrack } from '../@types/GalstreamsTrack';

/** The track's points, heliocentric equatorial Cartesian, kpc. */
export function trackPositionsKpc(track: GalstreamsTrack): Vec3[] {
  return track.ra.map((ra, i) =>
    raDecDistToEqCart({ raHours: ra / 15, decDeg: track.dec[i]!, distMpc: track.distanceKpc[i]! }),
  );
}
