/**
 * milkyWayUpsamplePass — HDR composite of the half-res `mw-aggregate`
 * offscreen (`milkyWayAggregatePass`'s additive star field). A plain
 * additive blit is correct here, unlike `starAggregateUpsamplePass`'s knee:
 * the cloud's records aren't Gaia photometry and don't need the LOD-symmetry
 * fix, so this draws through its OWN handle rather than sharing that one.
 *
 * Position: immediately before `milkyWayPass`'s dust pass, so dust
 * transmittance multiplies the upsampled starlight too.
 *
 * `enabled` shares `deriveMilkyWayCloudAlpha` with the producer, so the two
 * can never disagree about whether the offscreen was written this frame.
 */

import type { ContentPass } from '../../../@types/engine/frame/ContentPass';
import type { MilkyWayRuntime } from '../@types/MilkyWayRuntime';
import { createUpsamplePass } from '../../../services/engine/frame/passes/createUpsamplePass';
import { deriveMilkyWayCloudAlpha } from '../present/milkyWayCloudLiveness';

export function milkyWayUpsamplePass(runtime: MilkyWayRuntime): ContentPass {
  return createUpsamplePass({
    name: 'milky-way-upsample',
    sourceTargetId: 'mw-aggregate',
    handleOf: () => runtime.aggregateUpsample,
    enabled(state, ctx) {
      return deriveMilkyWayCloudAlpha(state, ctx) !== null;
    },
  });
}
