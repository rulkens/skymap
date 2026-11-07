/**
 * A galstreams track resampled into particles: evenly spaced along its length, scattered across it
 * by a Gaussian of the stream's width, dimmed only towards the two ends, coloured by star types
 * drawn for the stream's [Fe/H]. `rng` is shared across streams by the caller, so the build's
 * stream order fixes every draw.
 */
import { normalize3 } from '../../../src/utils/math/normalize3';
import { cumulativeLengths } from '../../utils/math/cumulativeLengths';
import { pointAlongPolyline } from '../../utils/math/pointAlongPolyline';
import { gaussian } from '../../utils/random/gaussian';
import { clamp } from '../../utils/textures/clamp';
import type { GalstreamsTrack } from '../@types/GalstreamsTrack';
import type { StreamParticles } from '../@types/StreamParticles';
import {
  TRACK_END_FADE_SLOPE,
  TRACK_LUMINOSITY,
  TRACK_PARTICLES_MAX,
  TRACK_PARTICLES_MIN,
  TRACK_PARTICLES_PER_KPC,
  TRACK_REFERENCE_WIDTH_KPC,
  TRACK_SIZE_KPC,
  TRACK_SIZE_PER_WIDTH,
} from '../data/streamsBuild.constants';
import { sampleStreamBv } from './sampleStreamBv';
import { streamColourT } from './streamColourT';
import { trackPositionsKpc } from './trackPositionsKpc';
import { trackWidthKpc } from './trackWidthKpc';

const KPC_TO_MPC = 1e-3;

export function trackParticles(
  track: GalstreamsTrack,
  feh: number,
  rng: () => number,
): StreamParticles {
  const points = trackPositionsKpc(track);
  const cumulative = cumulativeLengths(points);
  const lengthKpc = cumulative[cumulative.length - 1]!;
  const w = trackWidthKpc(track);
  const n = Math.floor(
    clamp(
      lengthKpc * TRACK_PARTICLES_PER_KPC * Math.max(1, w / TRACK_REFERENCE_WIDTH_KPC),
      TRACK_PARTICLES_MIN,
      TRACK_PARTICLES_MAX,
    ),
  );
  const size = clamp(TRACK_SIZE_PER_WIDTH * w, TRACK_SIZE_KPC[0], TRACK_SIZE_KPC[1]) * KPC_TO_MPC;

  const positionsMpc = new Float32Array(n * 3);
  const tangents = new Float32Array(n * 3);
  const sizeMpc = new Float32Array(n).fill(size);
  const luminosity = new Float32Array(n);
  const colourT = new Float32Array(n);
  for (let k = 0; k < n; k++) {
    const phase = (k + 0.5) / n;
    const { point, segment } = pointAlongPolyline(points, cumulative, phase * lengthKpc);
    const [a, b] = [points[segment]!, points[segment + 1]!];
    const t = normalize3([b[0] - a[0], b[1] - a[1], b[2] - a[2]]);
    // Gaussian offset with its along-track part removed: scatter across the stream only.
    const o = [gaussian(rng) * w, gaussian(rng) * w, gaussian(rng) * w];
    const along = o[0]! * t[0] + o[1]! * t[1] + o[2]! * t[2];
    for (let c = 0; c < 3; c++) {
      positionsMpc[k * 3 + c] = (point[c]! + o[c]! - along * t[c]!) * KPC_TO_MPC;
    }
    tangents.set(t, k * 3);
    const endFade = clamp(Math.min(phase, 1 - phase) * TRACK_END_FADE_SLOPE, 0, 1);
    luminosity[k] = endFade * (0.5 + 0.5 * rng()) * TRACK_LUMINOSITY;
    colourT[k] = streamColourT(sampleStreamBv(feh, rng));
  }
  return { positionsMpc, tangents, sizeMpc, luminosity, colourT };
}
