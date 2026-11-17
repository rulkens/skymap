/**
 * shownLabelRecords — the slab's label director as its pass reads it, or null while it draws
 * nothing (no records yet, none encoded, or idle with every alpha at 0). Transitional: the label
 * passes read it beside the old director until that one goes (plan Task 10, slice 10c).
 */

import type { PassState } from '../../../@types/engine/frame/PassState';
import type { ShownLabelRecords } from '../../../@types/rendering/ShownLabelRecords';

export function shownLabelRecords(
  state: Pick<PassState, 'subsystems'>,
  slab: number,
): ShownLabelRecords | null {
  const director = state.subsystems.labelDirectors.find((d) => d.row.slab === slab);
  if (!director || director.idle) return null;
  const { records, frame, view } = director;
  if (records === null || frame === null || view === null || records.count === 0) return null;
  return { records, frame, view };
}
