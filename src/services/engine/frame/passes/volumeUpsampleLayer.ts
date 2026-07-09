/**
 * volumeUpsampleLayer — the HDR content layer that bilinearly upsamples
 * the half-resolution scalar-volume target into the HDR target.
 *
 * Replaces the old `scalarVolumePass` (which raymarched directly into
 * the HDR target).  The raymarch itself now happens in `encodeVolumes`
 * — a pre-HDR step that opens its own render pass against the half-res
 * target.  This layer picks up where that step left off: it reads the
 * half-res target (the additive sum of every active field) with a
 * linear sampler and adds the result into the HDR target via the
 * additive-blend pipeline state baked into the upsample factory.
 *
 * Unlike every sibling HDR layer, `draw` doesn't touch the resolved
 * `SlabView` at all — the upsample is a screen-space 4-tap blit of an
 * already-rendered offscreen target, not a re-projection of world-space
 * geometry, so it has no view-projection or viewport to thread through.
 *
 * ### Position in the HDR content order
 *
 * Occupies the same slot the old `scalarVolumePass` did — after
 * filaments, before milky-way (see `passes/index.ts`).  Visual hierarchy:
 * the cosmic-web skeleton and density-field halos composite over the
 * brighter milky-way bulge, not vice versa.  Both surrounding layers
 * are additive so the slot choice is a visual rather than correctness
 * concern.
 *
 * ### Why `enabled` shares the volume-liveness projection
 *
 * The half-res raymarch (`scalarVolumeLayer`) writes the offscreen this layer
 * consumes; both gate on the SAME `deriveVolumeLiveness(...) !== null`, so the
 * producer and consumer of the volume target can never disagree (the audit's
 * stale-offscreen finding). That single derivation folds in the master
 * toggle-or-fade gate, focus recession, the read-edge settings clamp, and the
 * fade-tail-aware `hasActiveFields` check — the three axes the old hand-mirrored
 * gate here could drift on. The pre-bootstrap `volumeFieldRenderer === null`
 * case is covered inside the projection; `volumeUpsample === null` is no longer
 * an `enabled` concern (both handles are minted together in `initGpu`, and
 * `draw` keeps a defensive null-check regardless).
 */

import type { ContentLayer } from '../../../../@types/engine/frame/ContentLayer';
import { COSMO } from '../slabs';
import { deriveVolumeLiveness } from '../volumeLiveness';

export const volumeUpsampleLayer: ContentLayer = {
  name: 'volume-upsample',
  slab: COSMO,
  target: 'hdr',
  blend: 'additive',

  enabled(state, ctx) {
    return deriveVolumeLiveness(state, ctx) !== null;
  },

  draw(pass, _view, ctx, state) {
    // Defensive null-check — same pattern as filamentsLayer / milkyWayLayer:
    // the gate in `enabled` already proved the field is non-null, but
    // null-checking here too means future gate reorderings can't silently
    // skip the guard.  The cost is one reference read.
    if (state.gpu.volumeUpsample === null) return;
    state.gpu.volumeUpsample.draw(pass, ctx.volumeOffscreen.view);
  },
};
