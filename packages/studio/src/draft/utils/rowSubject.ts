/** What a row edits, from the authored draft: its effect, the saved start pose, or one waypoint. Null when it names nothing editable (a live start). */
import { effectAt } from './effectAt';
import { waypointSubject } from './waypointSubject';
import type { ClipData } from '../../../../../src/@types/animation/ClipData';
import type { RowRef } from '../../@types/rows/RowRef';
import type { InspectorSubject } from '../../@types/rows/InspectorSubject';

export function rowSubject(draft: ClipData, ref: RowRef): InspectorSubject | null {
  if (ref.kind === 'start') return typeof draft.start === 'object' ? draft.start : null;
  const effect = effectAt(draft, ref.path);
  if (ref.kind === 'effect') return effect;
  if (effect?.kind !== 'flyPath') return null;
  return ref.index < effect.waypoints.length ? waypointSubject(effect, ref.index) : null;
}
