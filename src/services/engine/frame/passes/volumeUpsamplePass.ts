/**
 * volumeUpsamplePass — the HDR_PASSES entry that bilinearly upsamples
 * the half-resolution scalar-volume target into the HDR target.
 *
 * Replaces the old `scalarVolumePass` (which raymarched directly into
 * the HDR target).  The raymarch itself now happens in `encodeVolumes`
 * — a pre-HDR step that opens its own render pass against the half-res
 * target.  This pass picks up where that step left off: it reads the
 * half-res target (the additive sum of every active field) with a
 * linear sampler and adds the result into the HDR target via the
 * additive-blend pipeline state baked into the upsample factory.
 *
 * ### Position in the HDR pass order
 *
 * Occupies the same slot the old `scalarVolumePass` did — after
 * filaments, before milky-way (see `passes/index.ts`).  Visual hierarchy:
 * the cosmic-web skeleton and density-field halos composite over the
 * brighter milky-way bulge, not vice versa.  Both surrounding passes
 * are additive so the slot choice is a visual rather than correctness
 * concern.
 *
 * ### Why three null-checks in `enabled`
 *
 * The pre-bootstrap window is the only legitimate case where any of the
 * three matters.  `scalarVolumeRenderer === null` means initGpu hasn't
 * finished; `volumeUpsample === null` means the same.  `hasActiveFields()`
 * is the per-frame fine-grained gate that skips the upsample when no
 * fields are enabled (since `encodeVolumes` then skipped the half-res
 * raymarch and the half-res target was cleared to zero — adding zero to
 * HDR is wasted work).
 */

import type { Pass } from '../../../../@types/engine/frame/Pass';

export const volumeUpsamplePass: Pass = {
  name: 'volume-upsample',

  enabled(state, _ctx, settings) {
    // Master toggle first — short-circuits before any null check.
    if (!settings.volumesEnabled) return false;
    // Pre-bootstrap window: either handle null means initGpu hasn't
    // finished.  Same shape as the old scalarVolumePass gate.
    if (state.gpu.scalarVolumeRenderer === null) return false;
    if (state.gpu.volumeUpsample === null) return false;
    // Skip the upsample when no fields are active — encodeVolumes
    // already skipped the raymarch into the half-res target, so the
    // target is at clear-value (0,0,0,0); adding zero to HDR is work
    // for no visual change.
    return state.gpu.scalarVolumeRenderer.hasActiveFields();
  },

  draw(pass, ctx, state, _settings, _deps) {
    // Defensive null-check — same pattern as filamentsPass / milkyWayPass:
    // the gate in `enabled` already proved the field is non-null, but
    // null-checking here too means future gate reorderings can't silently
    // skip the guard.  The cost is one reference read.
    if (state.gpu.volumeUpsample === null) return;
    state.gpu.volumeUpsample.draw(pass, ctx.volumeOffscreen.view);
  },
};
