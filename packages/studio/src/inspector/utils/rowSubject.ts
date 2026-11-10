/** What a row edits, from the authored draft: its effect, the saved start pose, or one waypoint. Null when it names nothing editable (a live start). */
import { effectAt } from '../../draft/utils/effectAt';
import type { ClipData } from '../../../../../src/@types/animation/ClipData';
import type { RowRef } from '../../@types/rows/RowRef';
import type { InspectorSubject } from '../@types/InspectorSubject';

export function rowSubject(draft: ClipData, ref: RowRef): InspectorSubject | null {
  if (ref.kind === 'start') return typeof draft.start === 'object' ? draft.start : null;
  const effect = effectAt(draft, ref.path);
  if (ref.kind === 'effect') return effect;
  if (effect?.kind !== 'flyPath') return null;
  const waypoint = effect.waypoints[ref.index];
  return waypoint === undefined
    ? null
    : { ...waypoint, last: ref.index === effect.waypoints.length - 1 };
}
