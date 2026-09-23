/**
 * deriveCosmicWebDensityLiveness — the state reads behind "is there live
 * density work this frame?", shared by the raymarch and its upsample so the
 * producer and consumer of the offscreen cannot disagree. The clamp, band fold
 * and `hasActiveFields` check are `deriveVolumeLiveness`'s pure core.
 */

import type { PassState } from '../../../@types/engine/frame/PassState';
import type { FrameView } from '../../../@types/engine/frame/FrameView';
import type { CosmicWebDensityFieldId } from '../../../@types/data/volume/CosmicWebDensityFieldId';
import type { VolumeFieldLiveness } from '../../../@types/rendering/VolumeFieldLiveness';
import type { CosmicWebDensityRuntime } from '../@types/CosmicWebDensityRuntime';
import { resolveLayerOpacity } from '../../../services/engine/presentation/focusRecession';
import { deriveVolumeLiveness } from '../../../utils/volume/deriveVolumeLiveness';

export function deriveCosmicWebDensityLiveness(
  runtime: CosmicWebDensityRuntime,
  state: PassState,
  ctx: FrameView,
): VolumeFieldLiveness<CosmicWebDensityFieldId> | null {
  const masterOpacity = state.subsystems.fades.opacityOf(
    { kind: 'cosmicWebDensity' },
    ctx.snapshot.nowMs,
  );
  if (!state.settings.cosmicWebDensity.enabled && masterOpacity <= 0) return null;

  // Recession lands on the master MULTIPLIER only: `recessedMaster ∈
  // [VOLUME_RECESSION, 1]` can't zero the layer, so the gate reads the pure toggle.
  const recessedMaster = resolveLayerOpacity(state, ctx, { kind: 'cosmicWebDensity' });
  // Mpc from the heliocentric render origin — what every field's `bands` measure.
  const camDistMpc = Math.hypot(ctx.drawCamPos[0], ctx.drawCamPos[1], ctx.drawCamPos[2]);

  return deriveVolumeLiveness(
    runtime.renderer,
    (id) => state.settings.cosmicWebDensity.items[id],
    (id) => resolveLayerOpacity(state, ctx, { kind: 'cosmicWebDensityField', id }) * recessedMaster,
    camDistMpc,
  );
}
