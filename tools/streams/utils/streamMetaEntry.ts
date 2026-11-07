import { arrayMean } from '../../../src/utils/math/arrayMean';
import { cumulativeLengths } from '../../utils/math/cumulativeLengths';
import { pointAlongPolyline } from '../../utils/math/pointAlongPolyline';
import type { GalstreamsTrack } from '../@types/GalstreamsTrack';
import type { StreamParticles } from '../@types/StreamParticles';
import type { StellarStreamMetaEntry } from '../@types/StellarStreamMetaEntry';
import { streamSlug } from './streamSlug';
import { trackPositionsKpc } from './trackPositionsKpc';

const KPC_TO_MPC = 1e-3;

/** The meta row of a galstreams stream; its label and focus sit at the track's midpoint by length. */
export function streamMetaEntry(
  track: GalstreamsTrack,
  particles: StreamParticles,
): StellarStreamMetaEntry {
  const points = trackPositionsKpc(track);
  const cumulative = cumulativeLengths(points);
  const lengthKpc = cumulative[cumulative.length - 1]!;
  const mid = pointAlongPolyline(points, cumulative, lengthKpc / 2).point;
  const name = track.name.replace(/_/g, ' ');
  return {
    id: streamSlug(name),
    names: [name],
    description: `${name}, a stellar stream traced by the ${track.ref} track of galstreams (Mateu 2023).`,
    source: 'galstreams',
    reference: track.ref,
    lengthKpc,
    distanceKpc: [Math.min(...track.distanceKpc), Math.max(...track.distanceKpc)],
    widthDeg: track.widthDeg,
    particleCount: particles.luminosity.length,
    colourT: arrayMean(particles.colourT),
    anchorMpc: [mid[0] * KPC_TO_MPC, mid[1] * KPC_TO_MPC, mid[2] * KPC_TO_MPC],
  };
}
