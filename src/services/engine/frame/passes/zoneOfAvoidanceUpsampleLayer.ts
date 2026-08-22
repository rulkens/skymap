/**
 * zoneOfAvoidanceUpsampleLayer — composites the reduced-res `zoa` offscreen
 * into HDR. The full-res curved lettering it used to draw via `postBlit` now
 * has its own dedicated draw site, `labels3dLayer` — gating the whole
 * Label3D draw on THIS layer's ZoA-band liveness meant no Label3D producer's
 * output (including the later VR labels) ever drew at planet scale, where
 * the band is never live. `produceZoneOfAvoidanceLettering` shares this same
 * liveness derivation to self-gate, so the lettering still only appears
 * when the band does.
 */

import { createUpsampleLayer } from './createUpsampleLayer';
import { COSMO } from '../slabs';
import { deriveZoneOfAvoidanceLiveness } from '../zoneOfAvoidanceLiveness';

export const zoneOfAvoidanceUpsampleLayer = createUpsampleLayer({
  name: 'zone-of-avoidance-upsample',
  slab: COSMO,
  sourceTargetId: 'zoa',
  handleOf: (state) => state.gpu.zoneOfAvoidanceUpsample,
  enabled(state, ctx) {
    return deriveZoneOfAvoidanceLiveness(state, ctx) !== null;
  },
});
