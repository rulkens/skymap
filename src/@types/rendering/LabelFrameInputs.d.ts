import type { BodyState } from '../scene/BodyState';
import type { MeshBody } from '../scene/MeshBody';
import type { OccluderBody } from '../scene/OccluderBody';
import type { FocusUniformsValue } from './FocusUniformsValue';
import type { LabelDirectorRow } from './LabelDirectorRow';
import type { OutputProjection } from './OutputProjection';

/**
 * What the label stages read besides the records, gathered by the director once per frame.
 * Per-source arrays are indexed by the source's ordinal in `LabelDirectorState.sources`.
 */
export type LabelFrameInputs = {
  readonly director: LabelDirectorRow;
  readonly projection: OutputProjection;
  readonly bodyStates: ReadonlyMap<string, BodyState>;
  /** The mesh bodies present this frame; `bodyStates` also holds the absent ones. */
  readonly meshBodies: readonly MeshBody[];
  readonly nowMs: number;
  /** The toggle's handed value: one number, or per item, read by the record's `fadeKey`. */
  readonly toggleFades: readonly (number | Readonly<Record<string, number>>)[];
  /** The focus recession of the toggle's entry at this blend (1 = none); the focused subject is exempt. */
  readonly recessions: readonly number[];
  /** `selection.focus`'s pick word, whatever its kind (a body focus does not recede the scene). */
  readonly focusPickId: number | null;
  readonly hoveredPick: number | null;
  readonly selectedPick: number | null;
  readonly focusedOnly: boolean;
  readonly focus: FocusUniformsValue;
  readonly occluders: readonly OccluderBody[];
};
