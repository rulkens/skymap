import type { StepSpan } from './StepSpan';

/** The placed steps of one `seq` that sets `overlap`; later passes read these. */
export type SeqSteps = {
  readonly startSec: number;
  readonly steps: readonly StepSpan[];
};
