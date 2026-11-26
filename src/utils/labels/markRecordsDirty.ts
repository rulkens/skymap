/** markRecordsDirty — widen the records' upload range to cover [from, to). */

import type { LabelRecords } from '../../@types/rendering/LabelRecords';

export function markRecordsDirty(
  records: Pick<LabelRecords, 'dirtyFrom' | 'dirtyTo'>,
  from: number,
  to: number,
): void {
  if (from >= to) return;
  const clean = records.dirtyFrom >= records.dirtyTo;
  records.dirtyFrom = clean ? from : Math.min(records.dirtyFrom, from);
  records.dirtyTo = clean ? to : Math.max(records.dirtyTo, to);
}
