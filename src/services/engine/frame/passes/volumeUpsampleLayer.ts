/**
 * volumeUpsampleLayer — HDR composite of the half-res scalar-volume
 * offscreen `scalarVolumeLayer` produces.
 *
 * Position: after milky-way/filaments/flow, before horizon-shell — a
 * visual layering choice (all-additive siblings), not a correctness one.
 *
 * `enabled` shares `deriveVolumeLiveness` with the producer, so the two
 * can never disagree about whether the offscreen was written this frame.
 */

import { createUpsampleLayer } from './createUpsampleLayer';
import { COSMO } from '../slabs';
import { deriveVolumeLiveness } from '../volumeLiveness';

export const volumeUpsampleLayer = createUpsampleLayer({
  name: 'volume-upsample',
  slab: COSMO,
  sourceTargetId: 'volume',
  handleOf: (state) => state.gpu.volumeUpsample,
  enabled(state, ctx) {
    return deriveVolumeLiveness(state, ctx) !== null;
  },
});
