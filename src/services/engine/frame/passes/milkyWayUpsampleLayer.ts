/**
 * milkyWayUpsampleLayer — HDR composite of the half-res `mw-aggregate`
 * offscreen (`milkyWayAggregateLayer`'s additive star field). A plain
 * additive blit is correct here, unlike `starAggregateUpsampleLayer`'s knee:
 * the cloud's records aren't Gaia photometry and don't need the LOD-symmetry
 * fix, so this draws through its OWN handle rather than sharing that one.
 *
 * Position: immediately before `milkyWayLayer`'s dust pass, so dust
 * transmittance multiplies the upsampled starlight too — matching the
 * old single-encoder ordering (stars then dust).
 *
 * `enabled` shares `deriveMilkyWayCloudAlpha` with the producer, so the two
 * can never disagree about whether the offscreen was written this frame.
 */

import { createUpsampleLayer } from './createUpsampleLayer';
import { NEAR0 } from '../slabs';
import { deriveMilkyWayCloudAlpha } from '../milkyWayCloudLiveness';

export const milkyWayUpsampleLayer = createUpsampleLayer({
  name: 'milky-way-upsample',
  slab: NEAR0,
  sourceTargetId: 'mw-aggregate',
  handleOf: (state) => state.gpu.milkyWayAggregateUpsample,
  enabled(state, ctx) {
    return deriveMilkyWayCloudAlpha(state, ctx) !== null;
  },
});
