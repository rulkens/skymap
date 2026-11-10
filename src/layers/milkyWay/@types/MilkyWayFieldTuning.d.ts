/**
 * MilkyWayFieldTuning — the v2 analytic field's live knobs. `divisors` is
 * keyed by `FieldTargetId`, the one key set the field's targets share, so a
 * divisor resizes its target row with no name translation in between.
 */
import type { FieldTargetId } from '../field/@types/FieldTargetId';

export type MilkyWayFieldTuning = {
  /** Multiplier on the field's light; 1 is the calibration point. */
  readonly exposure: number;
  /** Draws the field's dust; off swaps in a dust-free mixture. */
  readonly dust: boolean;
  /** Downsample divisor of each field target against the canvas. */
  readonly divisors: Readonly<Record<FieldTargetId, number>>;
};
