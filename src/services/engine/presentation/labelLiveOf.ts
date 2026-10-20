import type { LabelName } from '../../../@types/animation/LabelName';
import type { FrameView } from '../../../@types/engine/frame/FrameView';
import type { EngineState } from '../../../@types/engine/state/EngineState';
import { fadeIdentitiesOf } from '../../../utils/visibility/fadeIdentitiesOf';
import { visibilityEntryOf } from '../../../utils/visibility/visibilityEntryOf';
import { viewBandOf } from './viewBandOf';

/** The one liveness predicate, the producer skip's test for the screen and world label gates:
 * some ONE identity of the label entry heads for 1 or has a RAW fade above 0, and that same
 * item's distance band is above 0 at this view. Raw, never the handed value: a clip at 0 must
 * not cut a switched-off label's fade-out tail. */
export function labelLiveOf(
  state: Pick<EngineState, 'subsystems' | 'visibilityEntries'>,
  label: LabelName,
  view: Pick<FrameView, 'drawCamPos' | 'snapshot'>,
): boolean {
  const { fades } = state.subsystems;
  const { nowMs } = view.snapshot;
  const address = `label:${label}` as const;
  const ids = fadeIdentitiesOf(visibilityEntryOf(state.visibilityEntries, address));
  return ids.some(
    (id) =>
      (fades.targetOf(id) === 1 || fades.opacityOf(id, nowMs) > 0) &&
      viewBandOf(state.visibilityEntries, address, id.item, view) > 0,
  );
}
