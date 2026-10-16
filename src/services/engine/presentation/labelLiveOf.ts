import type { LabelName } from '../../../@types/animation/LabelName';
import type { EngineState } from '../../../@types/engine/state/EngineState';
import { fadeIdentitiesOf } from '../../../utils/visibility/fadeIdentitiesOf';
import { visibilityEntryOf } from './visibilityEntryOf';
import { visibilityLiveOf } from './visibilityLiveOf';

/** Whether any identity of a label entry is live: the producer skip's one test, shared by
 * the screen and world label gates. */
export function labelLiveOf(
  state: Pick<EngineState, 'subsystems' | 'visibilityEntries'>,
  label: LabelName,
  nowMs: number,
): boolean {
  const entry = visibilityEntryOf(state.visibilityEntries, `label:${label}`);
  return fadeIdentitiesOf(entry).some((id) => visibilityLiveOf(state, id, nowMs));
}
