import type { Vec3 } from '../../../src/@types/math/Vec3';
import { raDecDistToEqCart } from '../../../src/utils/math/raDecDistToEqCart';
import type { GalstreamsTrack } from '../@types/GalstreamsTrack';

const KPC_PER_MPC = 1e3;

/** The track's points, heliocentric equatorial Cartesian, kpc. */
export function trackPositionsKpc(track: GalstreamsTrack): Vec3[] {
  return track.ra.map((ra, i) => {
    const d = track.distanceKpc[i]! / KPC_PER_MPC;
    const p = raDecDistToEqCart({ raHours: ra / 15, decDeg: track.dec[i]!, distMpc: d });
    return [p[0] * KPC_PER_MPC, p[1] * KPC_PER_MPC, p[2] * KPC_PER_MPC];
  });
}
