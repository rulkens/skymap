/**
 * starAggregateUpsampleLayer — HDR composite of the half-res
 * `star-aggregates` offscreen, re-applying the star pass's hue-preserving
 * knee to the summed field (the LOD-symmetry fix; see the composite shader).
 *
 * Position: right after `star-catalog` in the (hdr, NEAR0) group, for
 * timing-HUD legibility — order among additive siblings is commutative.
 *
 * `enabled` shares `starCatalogVisible` with the producer, so a frame can
 * never composite a stale offscreen the aggregate render skipped clearing.
 */

import { createUpsampleLayer } from './createUpsampleLayer';
import { NEAR0 } from '../slabs';
import { starCatalogVisible } from './starCatalogLayer';

export const starAggregateUpsampleLayer = createUpsampleLayer({
  name: 'star-upsample',
  slab: NEAR0,
  sourceTargetId: 'star-aggregates',
  handleOf: (state) => state.gpu.starAggregateUpsample,
  enabled: starCatalogVisible,
});
