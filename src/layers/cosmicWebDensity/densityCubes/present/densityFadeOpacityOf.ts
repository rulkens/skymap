import type { ReadyFrameContext } from '../../../../@types/engine/frame/ReadyFrameContext';
import type { CosmicWebDensityFieldId } from '../../@types/CosmicWebDensityFieldId';
import { emphasisOf } from '../../../../services/engine/presentation/emphasisOf';
import { visibilityEntryOf } from '../../../../utils/visibility/visibilityEntryOf';
import { cosmicWebDensityVisibility } from '../../visibility';

const DENSITY_ENTRY = visibilityEntryOf(cosmicWebDensityVisibility, 'cosmicWebDensity');

/** Each field's handed fade times the Layer's focus emphasis: one reading for the region planner and
 *  the liveness, so the planner never builds a bundle whose regionOf reads its own unpublished value.
 *  No field can be the focus, so every field recedes alike. */
export function densityFadeOpacityOf(
  snapshot: Pick<ReadyFrameContext, 'focusBlend' | 'focusPickId'>,
  fade: Readonly<Record<CosmicWebDensityFieldId, number>>,
): (id: CosmicWebDensityFieldId) => number {
  const emphasis = emphasisOf(DENSITY_ENTRY, snapshot);
  return (id) => fade[id] * emphasis;
}
