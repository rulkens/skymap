import type { LabelSource } from '../engine/layer/LabelSource';
import type { LabelDirectorRow } from './LabelDirectorRow';
import type { LabelFrame } from './LabelFrame';
import type { LabelRecords } from './LabelRecords';
import type { LabelRecordView } from './LabelRecordView';

/**
 * One `LABEL_DIRECTORS` row at run time: its sources (registered by `createLayers`), its records
 * and frame columns (null until the font atlases load), and what the passes read this frame.
 */
export type LabelDirectorState = {
  readonly row: LabelDirectorRow;
  readonly sources: LabelSource<unknown>[];
  records: LabelRecords | null;
  frame: LabelFrame | null;
  /** This frame's projection and highlight words; null before the first run. */
  view: LabelRecordView | null;
  /** Every toggle was 0 last frame and nothing ramped, so every alpha is 0: stages and draw skip. */
  idle: boolean;
};
