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
 * ### Why three null-checks in `enabled`
 *
 * The pre-bootstrap window is the only legitimate case where any of the
 * three matters.  `volumeFieldRenderer === null` means initGpu hasn't
 * finished; `volumeUpsample === null` means the same.  `hasActiveFields()`
 * is the per-frame fine-grained gate that skips the upsample when no
 * fields are enabled (since `encodeVolumes` then skipped the half-res
 * raymarch and the half-res target was cleared to zero — adding zero to
 * HDR is wasted work).  The master on/off gate reads
 * `state.settings.volumes.enabled` directly — the old `settings.volumesEnabled`
 * forwarded the same bit; the per-frame bag is being dissolved.
 */

import type { ContentLayer } from '../../../../@types/engine/frame/ContentLayer';
import { COSMO } from '../slabs';
import type { VolumeFieldId } from '../../../../@types/data/volume/VolumeFieldId';

export const volumeUpsampleLayer: ContentLayer = {
  name: 'volume-upsample',
  slab: COSMO,
  target: 'hdr',
  blend: 'additive',

  enabled(state, ctx) {
    // Pre-bootstrap window: either handle null means initGpu hasn't
    // finished.  Same shape as the old scalarVolumePass gate.
    if (state.gpu.volumeFieldRenderer === null) return false;
    if (state.gpu.volumeUpsample === null) return false;
    // Master gate: state boolean OR a non-zero master fade tail.
    // While master is fading out, encodeHdr* is still drawing into
    // the half-res target (each field's opacity multiplied by the
    // master), so this blit must run to bring those pixels onto HDR.
    const now = ctx.nowMs;
    const masterOpacity = state.subsystems.fades.opacityOf({ kind: 'volumesMaster' }, now);
    if (!state.settings.volumes.enabled && masterOpacity <= 0) return false;
    // Per-field gate: active fields OR fade-out tails in flight.
    const settingsOf = (id: VolumeFieldId) => state.settings.volumes.items[id];
    if (state.gpu.volumeFieldRenderer.hasActiveFields(settingsOf)) return true;
    for (const id of state.gpu.volumeFieldRenderer.listIds()) {
      if (state.subsystems.fades.opacityOf({ kind: 'volumeField', id }, now) > 0) {
        return true;
      }
    }
    return false;
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
