import type { ProvenanceAxisId } from '../settings/ProvenanceAxisId';

/**
 * ProvenanceCounts — how much of a loaded catalog is guesswork, per axis.
 *
 * `total` is the catalog's row count and `estimated[axis]` the subset whose
 * value on that axis came from a fallback rather than a measurement, so the
 * debug panel can show both the absolute number and the fraction without
 * re-deriving one from the other.
 *
 * Plain numbers, no typed arrays: this lands in the Redux store, where the
 * serializability check runs.
 */
export type ProvenanceCounts = {
  total: number;
  estimated: Record<ProvenanceAxisId, number>;
};
