/**
 * galstreams lists track points in survey order, not orbital order. Flip a track whose points run
 * against the stars' galactocentric motion (proper motion + radial velocity, 0 where missing, +
 * the solar reflex), so particle tangents point the way the stream flows.
 */
import { galToEq } from '../../utils/math/galToEq';
import type { GalstreamsTrack } from '../@types/GalstreamsTrack';
import { KMS_PER_KPC_MASYR, SUN_VELOCITY_GAL_KMS } from '../data/streamsBuild.constants';
import { trackPositionsKpc } from './trackPositionsKpc';

const RAD = Math.PI / 180;

export function orientTrackByMotion(track: GalstreamsTrack): GalstreamsTrack {
  const p = trackPositionsKpc(track);
  const sun = galToEq(SUN_VELOCITY_GAL_KMS);
  let along = 0;
  for (let i = 0; i + 1 < p.length; i++) {
    const [pmRa, pmDec] = [track.pmRaCosDec[i]!, track.pmDec[i]!];
    if (!Number.isFinite(pmRa) || !Number.isFinite(pmDec)) continue;
    const [ra, dec, d] = [track.ra[i]! * RAD, track.dec[i]! * RAD, track.distanceKpc[i]!];
    const rv = Number.isFinite(track.radialVelocity[i]) ? track.radialVelocity[i]! : 0;
    const k = KMS_PER_KPC_MASYR * d;
    const [sa, ca, sd, cd] = [Math.sin(ra), Math.cos(ra), Math.sin(dec), Math.cos(dec)];
    // v = rv·r̂ + k·(pmRa·ê_ra + pmDec·ê_dec) + v☉
    const v = [
      rv * cd * ca + k * (-pmRa * sa - pmDec * sd * ca) + sun[0],
      rv * cd * sa + k * (pmRa * ca - pmDec * sd * sa) + sun[1],
      rv * sd + k * pmDec * cd + sun[2],
    ];
    along += (p[i + 1]![0] - p[i]![0]) * v[0]! + (p[i + 1]![1] - p[i]![1]) * v[1]!;
    along += (p[i + 1]![2] - p[i]![2]) * v[2]!;
  }
  if (along >= 0) return track;
  const rev = (a: readonly number[]) => [...a].reverse();
  return {
    ...track,
    ra: rev(track.ra),
    dec: rev(track.dec),
    distanceKpc: rev(track.distanceKpc),
    pmRaCosDec: rev(track.pmRaCosDec),
    pmDec: rev(track.pmDec),
    radialVelocity: rev(track.radialVelocity),
  };
}
