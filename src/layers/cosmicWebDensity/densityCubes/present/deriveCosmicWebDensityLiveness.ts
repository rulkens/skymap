/**
 * deriveCosmicWebDensityLiveness — the state reads behind "is there live
 * density work this frame?", shared by the raymarch and its upsample so the
 * producer and consumer of the offscreen cannot disagree. Each field's handed value
 * already folds the section switch, its own switch and clip; its focus emphasis is
 * composed by `densityFadeOpacityOf`, which the region planner reads too. Nothing is
 * live until the jitter mask's slot settles.
 */

import type { PassState } from '../../../../@types/engine/frame/PassState';
import type { FrameView } from '../../../../@types/engine/frame/FrameView';
import type { CosmicWebDensityFieldId } from '../../@types/CosmicWebDensityFieldId';
import type { VolumeFieldLiveness } from '../../../../@types/rendering/VolumeFieldLiveness';
import type { CosmicWebDensityRuntime } from '../../@types/CosmicWebDensityRuntime';
import { deriveVolumeLiveness } from '../utils/deriveVolumeLiveness';
import { detailRegionPlanner } from '../../detailRegion/plan/detailRegionPlanner';
import { densityFadeOpacityOf } from './densityFadeOpacityOf';

export function deriveCosmicWebDensityLiveness(
  runtime: CosmicWebDensityRuntime,
  state: PassState,
  ctx: FrameView,
  fade: Readonly<Record<CosmicWebDensityFieldId, number>>,
): VolumeFieldLiveness<CosmicWebDensityFieldId> | null {
  // Before the mask lands a march shows the zero mask's step grid; a mask the loader gave up on
  // draws unjittered rather than keeping the volume off for the session.
  const mask = runtime.jitterMaskSlot.state().kind;
  if (mask !== 'ready' && mask !== 'error') return null;
  // A typed handle only: the result store files a once value by planner name.
  const regions = detailRegionPlanner(runtime);
  return deriveVolumeLiveness(
    runtime.renderer,
    (id) => state.settings.cosmicWebDensity.items[id],
    densityFadeOpacityOf(ctx.snapshot, fade),
    // PRELUDE plans the region before SCENE, so every view reads this frame's value.
    (id) => ctx.snapshot.plans.get(regions).draws[id],
  );
}
