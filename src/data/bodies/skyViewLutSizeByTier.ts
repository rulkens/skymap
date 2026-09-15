import type { Tier } from '../../@types/data/Tier';

/** Sky-view LUT texels per tier — Adreno bisection found the 33 ms/frame cost is
 *  fetch-issue stalls in a ROLLED compute loop, not bandwidth (4-texel-pinned
 *  taps still cost 33 ms). Fetches scale as texels x steps x 2, so shrinking
 *  texels (not steps) keeps the scattering integral correct; bilinear hides the
 *  lost resolution on phone, but bands it on a desktop monitor. */
export const SKY_VIEW_LUT_SIZE_BY_TIER: Readonly<Record<Tier, readonly [number, number]>> = {
  small: [64, 36],
  medium: [192, 108],
  large: [192, 108],
};
