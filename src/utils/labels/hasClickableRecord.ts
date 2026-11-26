/** hasClickableRecord — whether any record takes clicks; the pick gate asks without building quads. */

import type { LabelFrame } from '../../@types/rendering/LabelFrame';
import type { LabelRecords } from '../../@types/rendering/LabelRecords';
import { isRecordClickable } from './isRecordClickable';

export function hasClickableRecord(records: LabelRecords, frame: LabelFrame): boolean {
  for (let i = 0; i < records.count; i++) if (isRecordClickable(records, frame, i)) return true;
  return false;
}
