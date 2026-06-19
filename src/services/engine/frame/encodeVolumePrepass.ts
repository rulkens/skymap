/**
 * encodeVolumePrepass — the shared half-resolution scalar-volume pre-pass.
 *
 * Both HDR encoders run this identical block immediately before their HDR
 * render pass(es): `encodeHdrSplit` (the developer-only per-pass-timing
 * path) and `encodeHdrSingle` (the default production path).  The only
 * difference between the two call sites is the `timingService` argument
 * — `encodeHdrSplit` passes its non-null service so the raymarch bills
 * against the `'scalar-volume'` timing slot, `encodeHdrSingle`
 * passes `null` (no timing).  The rest — the renderer null guard, the
 * master-opacity gate, the focus-recession `recessedMaster` multiplier,
 * the per-field `fadeOpacityOf` closure, the `hasActiveFields` check, and
 * the `encodeVolumes` call — is byte-identical.
 *
 * The timing descriptor is resolved LAZILY: `descriptorFor('scalar-volume')`
 * is only called once control reaches the `encodeVolumes` call (i.e. after
 * every gate passes), so the slot isn't touched on frames where the volume
 * pass is skipped.
 *
 * Sharing the block keeps the two encoders in lockstep: a change to the
 * gate, the recession composition, or the volume draw can only land in one
 * place, so the split and single paths can never silently diverge.
 *
 * ### Gating rationale
 *
 * Master gate: `settings.volumesEnabled` OR a non-zero master fade tail.
 * Focus recession dims the whole volume subsystem in lockstep with the
 * filament overlay, but it's applied to the master MULTIPLIER only, not the
 * gate above: recession ∈ [VOLUME_RECESSION, 1] can never zero the layer,
 * so the gate keeps reading the pure toggle (matches `filamentsPass.enabled`).
 * The `fadeOpacityOf` closure multiplies the recessed master into every
 * per-field lookup so a master fade-out smoothly drags every field down
 * together.
 *
 * `encodeVolumes` carries its own null + `hasActiveFields` guard for direct
 * callers, but the call-site gate here makes it unreachable by construction.
 * The duplication is deliberate — gating at the call site avoids even the
 * function-call overhead, and on tile-based GPUs an empty
 * `beginRenderPass(loadOp: 'clear')` is still a non-zero cost (tile-RAM
 * load+store) even when nothing draws inside.
 */

import type { ReadyFrameContext } from '../../../@types/engine/frame/ReadyFrameContext';
import type { EngineState } from '../../../@types/engine/state/EngineState';
import type { RenderFrameSettings } from '../../../@types/engine/frame/RenderFrameSettings';
import type { GpuTimingService } from '../../../@types/gpu/timing/GpuTimingService';
import type { VolumeFieldId } from '../../../@types/data/volume/VolumeFieldId';
import { encodeVolumes } from './encodeVolumes';
import { resolveLayerOpacity } from '../presentation/focusRecession';
import { clampVolumeFieldSettings } from '../../../utils/clampVolumeFieldSettings';

export function encodeVolumePrepass(
  encoder: GPUCommandEncoder,
  ctx: ReadyFrameContext,
  state: EngineState,
  settings: RenderFrameSettings,
  timingService: GpuTimingService | null,
): void {
  if (state.gpu.volumeFieldRenderer !== null) {
    const nowMs = performance.now();
    const masterOpacity = state.subsystems.fades.opacityOf({ kind: 'volumesMaster' }, nowMs);
    if (settings.volumesEnabled || masterOpacity > 0) {
      // Focus recession dims the whole volume subsystem in lockstep with the
      // filament overlay. Applied to the master MULTIPLIER only, not the gate
      // above: recession ∈ [VOLUME_RECESSION, 1] can never zero the layer, so
      // the gate keeps reading the pure toggle (matches filamentsPass.enabled).
      const recessedMaster = resolveLayerOpacity(
        state.subsystems.fades,
        { kind: 'volumesMaster' },
        ctx.focusBlend,
        nowMs,
      );
      const fadeOpacityOf = (id: VolumeFieldId) =>
        state.subsystems.fades.opacityOf({ kind: 'volumeField', id }, nowMs) *
        recessedMaster;
      // The store holds raw Intent; clamp GPU-bound fields at the read edge so
      // out-of-range values never reach the raymarch shader uniforms.  Mirrors
      // the setFlow / clampFlowParams pattern for the flow-field subsystem.
      const settingsOf = (id: VolumeFieldId) => {
        const raw = state.settings.volumes.items[id];
        return raw === undefined ? undefined : clampVolumeFieldSettings(raw);
      };
      if (state.gpu.volumeFieldRenderer.hasActiveFields(settingsOf, fadeOpacityOf)) {
        encodeVolumes({
          encoder,
          ctx,
          volumeFieldRenderer: state.gpu.volumeFieldRenderer,
          settingsOf,
          fadeOpacityOf,
          // Resolve the timing descriptor lazily, inside every gate, so
          // the slot is touched exactly when the volume pass actually
          // encodes. A `null` service (the single/no-timing path) yields
          // `undefined`.
          timestampWrites: timingService?.descriptorFor('scalar-volume'),
        });
      }
    }
  }
}
