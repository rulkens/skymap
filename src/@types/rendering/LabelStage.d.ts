import type { LabelFrame } from './LabelFrame';
import type { LabelFrameInputs } from './LabelFrameInputs';
import type { LabelRecords } from './LabelRecords';

/** One per-frame label stage (`LABEL_STAGES`): writes only its own columns, allocates nothing. */
export type LabelStage = (
  records: LabelRecords,
  frame: LabelFrame,
  inputs: LabelFrameInputs,
) => void;
