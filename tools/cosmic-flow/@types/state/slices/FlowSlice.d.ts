/**
 * FlowSlice — the active flow mode plus both modes' parameter sets.
 *
 * Both `advect` and `streamline` params are retained simultaneously; `mode`
 * selects which one the visualization currently integrates with. Keeping the
 * inactive mode's params live (rather than discarding on switch) means toggling
 * back and forth is lossless — the UI sliders snap to that mode's remembered
 * values.
 */
import type { FlowMode } from './FlowMode';
import type { FlowModeParams } from './FlowModeParams';

export type FlowSlice = {
  readonly mode: FlowMode;
  readonly advect: FlowModeParams;
  readonly streamline: FlowModeParams;
};
