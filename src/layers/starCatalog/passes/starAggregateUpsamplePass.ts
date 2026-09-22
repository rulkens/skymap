/**
 * starAggregateUpsamplePass — HDR composite of the half-res
 * `star-aggregates` offscreen, re-applying the star pass's hue-preserving
 * knee to the summed field (the LOD-symmetry fix; see the composite shader).
 *
 * Position: right after `star-catalog` in the (hdr, NEAR0) group, for
 * timing-HUD legibility — order among additive siblings is commutative.
 *
 * `enabled` shares `starCatalogVisible` with the producer, so a frame can
 * never composite a stale offscreen the aggregate render skipped clearing.
 */

import type { ContentPass } from '../../../@types/engine/frame/ContentPass';
import type { StarCatalogRuntime } from '../@types/StarCatalogRuntime';
import { createUpsamplePass } from '../../../services/engine/frame/passes/createUpsamplePass';
import { starCatalogVisible } from '../render/cut/starCatalogVisible';

export function starAggregateUpsamplePass(runtime: StarCatalogRuntime): ContentPass {
  return createUpsamplePass({
    name: 'star-upsample',
    sourceTargetId: 'star-aggregates',
    handleOf: () => runtime.aggregateUpsample,
    enabled: (state, ctx) => starCatalogVisible(runtime, state.settings.starCatalogs, ctx),
  });
}
