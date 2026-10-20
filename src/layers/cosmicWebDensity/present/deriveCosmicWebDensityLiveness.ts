/**
 * deriveCosmicWebDensityLiveness — the state reads behind "is there live
 * density work this frame?", shared by the raymarch and its upsample so the
 * producer and consumer of the offscreen cannot disagree. Each field's handed value
 * already folds the section switch, its own switch and clip; its focus emphasis is
 * composed here, for both passes. No field can be the focus, so every field recedes
 * alike. The clamp and `hasActiveFields` check are `deriveVolumeLiveness`'s
 * pure core.
 */

import type { PassState } from '../../../@types/engine/frame/PassState';
import type { FrameView } from '../../../@types/engine/frame/FrameView';
import type { CosmicWebDensityFieldId } from '../../../@types/data/volume/CosmicWebDensityFieldId';
import type { VolumeFieldLiveness } from '../../../@types/rendering/VolumeFieldLiveness';
import type { CosmicWebDensityRuntime } from '../@types/CosmicWebDensityRuntime';
import { deriveVolumeLiveness } from '../../../utils/volume/deriveVolumeLiveness';
import { visibilityEntryOf } from '../../../utils/visibility/visibilityEntryOf';
import { emphasisOf } from '../../../services/engine/presentation/emphasisOf';
import { cosmicWebDensityVisibility } from '../visibility';

const DENSITY_ENTRY = visibilityEntryOf(cosmicWebDensityVisibility, 'cosmicWebDensity');

export function deriveCosmicWebDensityLiveness(
  runtime: CosmicWebDensityRuntime,
  state: PassState,
  ctx: FrameView,
  fade: Readonly<Record<CosmicWebDensityFieldId, number>>,
): VolumeFieldLiveness<CosmicWebDensityFieldId> | null {
  const emphasis = emphasisOf(DENSITY_ENTRY, ctx.snapshot);

  return deriveVolumeLiveness(
    runtime.renderer,
    (id) => state.settings.cosmicWebDensity.items[id],
    (id) => fade[id] * emphasis,
  );
}
