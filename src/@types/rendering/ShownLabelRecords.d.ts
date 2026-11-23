import type { LabelFrame } from './LabelFrame';
import type { LabelRecords } from './LabelRecords';
import type { LabelRecordView } from './LabelRecordView';

/** A label director that draws this frame, as its pass reads it (`shownLabelRecords`). */
export type ShownLabelRecords = {
  readonly records: LabelRecords;
  readonly frame: LabelFrame;
  readonly view: LabelRecordView;
};
