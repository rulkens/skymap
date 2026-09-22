/**
 * volumeLiveness — the one home for "is there live scalar-volume work this
 * frame?". Both volume layers gate on `deriveVolumeLiveness(...) !== null` — the
 * half-res raymarch producer and the upsample consumer that reads its offscreen
 * — so they cannot drift into drawing into a target nobody samples. The state
 * reads (renderer handle, master toggle/fade, recession, camera distance) live
 * here; the clamp, the per-field band fold and the `hasActiveFields` check are
 * `src/utils/volume/deriveVolumeLiveness.ts`'s pure core.
 *
 * Pure projection: reads live state, allocates fresh closures per call, caches
 * nothing, so the several calls per frame are safe by construction.
 */

import type { PassState } from '../../../@types/engine/frame/PassState';
import type { FrameView } from '../../../@types/engine/frame/FrameView';
import type { CosmicWebDensityFieldId } from '../../../@types/data/volume/CosmicWebDensityFieldId';
import type { VolumeFieldLiveness } from '../../../@types/rendering/VolumeFieldLiveness';
import { resolveLayerOpacity } from '../presentation/focusRecession';
import { deriveVolumeLiveness as deriveVolumeFieldLiveness } from '../../../utils/volume/deriveVolumeLiveness';

// `null` = no live volume work: renderer missing, master off AND fully faded, or
// no field active.
export function deriveVolumeLiveness(
  state: PassState,
  ctx: FrameView,
): VolumeFieldLiveness<CosmicWebDensityFieldId> | null {
  const renderer = state.gpu.volumeFieldRenderer;
  if (renderer === null) return null;

  const nowMs = ctx.snapshot.nowMs;
  const masterOpacity = state.subsystems.fades.opacityOf({ kind: 'cosmicWebDensity' }, nowMs);
  if (!state.settings.cosmicWebDensity.enabled && masterOpacity <= 0) return null;

  // Recession lands on the master MULTIPLIER only: `recessedMaster ∈
  // [VOLUME_RECESSION, 1]` can't zero the layer, so the gate reads the pure toggle.
  const recessedMaster = resolveLayerOpacity(state, ctx, { kind: 'cosmicWebDensity' });
  // Mpc from the heliocentric render origin — the key every field's `bands` are
  // measured against.
  const camDistMpc = Math.hypot(ctx.drawCamPos[0], ctx.drawCamPos[1], ctx.drawCamPos[2]);

  return deriveVolumeFieldLiveness(
    renderer,
    (id) => state.settings.cosmicWebDensity.items[id],
    (id) => resolveLayerOpacity(state, ctx, { kind: 'cosmicWebDensityField', id }) * recessedMaster,
    camDistMpc,
  );
}
