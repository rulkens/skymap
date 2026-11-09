import { STREAM_BP_RP_RANGE } from '../../../src/layers/stellarStreams/streaks/data/stellarStreamColours.constants';
import { bvToBpRp } from '../../utils/color/bvToBpRp';

/** A particle's B−V as colour t: stored as Gaia BP−RP, the star tint ramp's axis, as the star
 * build converts Hipparcos colours, so the shader needs no B−V polynomial. */
export function streamColourT(bv: number): number {
  const [lo, hi] = STREAM_BP_RP_RANGE;
  return (bvToBpRp(bv) - lo) / (hi - lo);
}
