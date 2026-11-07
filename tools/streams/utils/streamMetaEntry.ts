import { arrayMean } from '../../../src/utils/math/arrayMean';
import { SCALE_UNITS } from '../../../src/data/scaleUnits';
import { cumulativeLengths } from '../../utils/math/cumulativeLengths';
import { pointAlongPolyline } from '../../utils/math/pointAlongPolyline';
import type { GalstreamsTrack } from '../@types/GalstreamsTrack';
import type { StreamParticles } from '../@types/StreamParticles';
import type { StellarStreamMetaEntry } from '../@types/StellarStreamMetaEntry';
import type { StreamMetallicity } from '../@types/StreamMetallicity';
import type { StreamWikipedia } from '../@types/StreamWikipedia';
import { streamArticleFields } from './streamArticleFields';
import { streamSlug } from './streamSlug';
import { streamStellarMass } from './streamStellarMass';
import { trackPositionsKpc } from './trackPositionsKpc';
import { trackWidthKpc } from './trackWidthKpc';
import { streamCentreline } from './streamCentreline';
import { cappedFrameRadiusKpc } from './cappedFrameRadiusKpc';
import { streamFocusBoost } from './streamFocusBoost';

/** The meta row of a galstreams stream; its label and focus sit at the track's midpoint by length. */
export function streamMetaEntry(
  track: GalstreamsTrack,
  particles: StreamParticles,
  metallicity: StreamMetallicity | null,
  wikipedia: StreamWikipedia | null,
): StellarStreamMetaEntry {
  const points = trackPositionsKpc(track);
  const cumulative = cumulativeLengths(points);
  const lengthKpc = cumulative[cumulative.length - 1]!;
  const mid = pointAlongPolyline(points, cumulative, lengthKpc / 2).point;
  const name = track.name.replace(/_/g, ' ');
  const widthKpc = trackWidthKpc(track);
  return {
    id: streamSlug(name),
    names: [name],
    ...streamArticleFields(wikipedia),
    source: 'galstreams',
    reference: track.ref,
    lengthKpc,
    frameRadiusKpc: cappedFrameRadiusKpc(lengthKpc / 2, Math.hypot(mid[0], mid[1], mid[2])),
    distanceKpc: [Math.min(...track.distanceKpc), Math.max(...track.distanceKpc)],
    widthDeg: track.widthDeg,
    particleCount: particles.luminosity.length,
    colourT: arrayMean(particles.colourT),
    focusBoost: streamFocusBoost(particles, lengthKpc, widthKpc),
    metallicity,
    stellarMass: streamStellarMass(track.name),
    anchorMpc: [
      mid[0] * SCALE_UNITS.KPC_TO_MPC,
      mid[1] * SCALE_UNITS.KPC_TO_MPC,
      mid[2] * SCALE_UNITS.KPC_TO_MPC,
    ],
    ...streamCentreline(points, widthKpc),
  };
}
