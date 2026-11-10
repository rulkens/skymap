/**
 * FieldFramePlan — which field targets one frame encodes and composites, as
 * one value computed once per frame by `planFieldFrame`. The renderer encodes
 * exactly `encodes` and the composite loop adds exactly `composites`, so a
 * target the frame never cleared can't be summed into HDR.
 */
import type { FieldTargetId } from './FieldTargetId';

export type FieldFramePlan = {
  /** Encode order, a subsequence of `FIELD_TARGET_IDS`. */
  readonly encodes: readonly FieldTargetId[];
  /** `encodes` minus `'dustMap'`, in the same order; never re-derived. */
  readonly composites: readonly FieldTargetId[];
};
