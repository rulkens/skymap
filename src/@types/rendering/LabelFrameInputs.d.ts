import type { BodyState } from '../scene/BodyState';
import type { OccluderBody } from '../scene/OccluderBody';
import type { FocusUniformsValue } from './FocusUniformsValue';
import type { LabelDirectorRow } from './LabelDirectorRow';
import type { OutputProjection } from './OutputProjection';

/**
 * What the label stages read besides the records, gathered by the director once per frame.
 * Per-source arrays are indexed by the source's ordinal in `LabelRecords.sources`.
 */
export type LabelFrameInputs = {
  readonly director: LabelDirectorRow;
  readonly projection: OutputProjection;
  readonly bodyStates: ReadonlyMap<string, BodyState>;
  readonly nowMs: number;
  /** The toggle's handed value: one number, or per item, read by the record's `fadeKey`. */
  readonly toggleFades: readonly (number | Readonly<Record<string, number>>)[];
  /** The focus recession of the toggle's entry at this blend (1 = none); the focused subject is exempt. */
  readonly recessions: readonly number[];
  readonly focusPickId: number | null;
  readonly hoveredPick: number | null;
  readonly selectedPick: number | null;
  readonly focusedOnly: boolean;
  readonly focus: FocusUniformsValue;
  readonly occluders: readonly OccluderBody[];
};
