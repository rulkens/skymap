import { STELLAR_STREAMS_LOOKS } from '../../../src/layers/stellarStreams/streaks/data/stellarStreamsLooks';
import { SCALE_UNITS } from '../../../src/data/scaleUnits';
import { clamp } from '../../utils/textures/clamp';
import type { StreamParticles } from '../@types/StreamParticles';
import {
  STREAM_FOCUS_BOOST_CAP,
  STREAM_FOCUS_BOOST_TARGET,
  TRACK_MIN_WIDTH_KPC,
} from '../data/streamsBuild.constants';

/**
 * How much a focus brightens this stream: its surface brightness lifted toward the target, never
 * dimmed, at most the cap. streams.wesl keeps a sprite's flux (luminosity × size²) whether it is
 * resolved or clamped to `minPx`, so the summed flux over the track's area predicts how bright the
 * stream reads at any distance; particle count alone would miss the sprite size, which follows the
 * width. The streak's flow slides each particle up to half a loop either way, so the track's
 * length grows by one loop: that is what makes a short cluster stream read faint.
 */
export function streamFocusBoost(
  particles: Pick<StreamParticles, 'luminosity' | 'sizeMpc'>,
  lengthKpc: number,
  widthKpc: number,
): number {
  let flux = 0;
  for (let i = 0; i < particles.luminosity.length; i++) {
    const sizeKpc = particles.sizeMpc[i]! / SCALE_UNITS.KPC_TO_MPC;
    flux += particles.luminosity[i]! * sizeKpc * sizeKpc;
  }
  const areaKpc2 =
    (lengthKpc + STELLAR_STREAMS_LOOKS.streak.flow) * Math.max(widthKpc, TRACK_MIN_WIDTH_KPC);
  return clamp(STREAM_FOCUS_BOOST_TARGET / (flux / areaKpc2), 1, STREAM_FOCUS_BOOST_CAP);
}
