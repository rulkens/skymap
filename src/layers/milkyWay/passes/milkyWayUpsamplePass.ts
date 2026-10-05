/**
 * milkyWayUpsamplePass — HDR composite of the half-res `mw-aggregate`
 * offscreen (`milkyWayAggregatePass`'s star field). A plain additive blit is
 * correct here — unlike `starAggregateUpsamplePass`, these records aren't
 * Gaia photometry and need no LOD-symmetry fix — so this draws through its
 * own handle. Runs immediately before `milkyWayPass`'s dust pass, so dust
 * multiplies the upsampled starlight too; `enabled` shares
 * `deriveMilkyWayCloudAlpha` with the producer so the two can't disagree.
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
