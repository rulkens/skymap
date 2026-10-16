/**
 * deriveCosmicWebDensityLiveness — the state reads behind "is there live
 * density work this frame?", shared by the raymarch and its upsample so the
 * producer and consumer of the offscreen cannot disagree. Each field's handed value
 * already folds the section switch, its own switch, recession and clip. The clamp, band
 * fold and `hasActiveFields` check are `deriveVolumeLiveness`'s pure core.
 */

import type { PassState } from '../../../@types/engine/frame/PassState';
import type { FrameView } from '../../../@types/engine/frame/FrameView';
import type { CosmicWebDensityFieldId } from '../../../@types/data/volume/CosmicWebDensityFieldId';
import type { VolumeFieldLiveness } from '../../../@types/rendering/VolumeFieldLiveness';
import type { CosmicWebDensityRuntime } from '../@types/CosmicWebDensityRuntime';
import { deriveVolumeLiveness } from '../../../utils/volume/deriveVolumeLiveness';

export function deriveCosmicWebDensityLiveness(
  runtime: CosmicWebDensityRuntime,
  state: PassState,
  ctx: FrameView,
  fade: Readonly<Record<CosmicWebDensityFieldId, number>>,
): VolumeFieldLiveness<CosmicWebDensityFieldId> | null {
  // Mpc from the heliocentric render origin — what every field's `bands` measure.
  const camDistMpc = Math.hypot(ctx.drawCamPos[0], ctx.drawCamPos[1], ctx.drawCamPos[2]);

  return deriveVolumeLiveness(
    runtime.renderer,
    (id) => state.settings.cosmicWebDensity.items[id],
    (id) => fade[id],
    camDistMpc,
  );
}
