/**
 * The `ProvenanceFilter` spec: its GPU encoding and its menu order.
 *
 * The shader needs a number, the UI needs an ordered label list, and both must
 * agree with the string union.  Keeping the two tables next to each other (and
 * both keyed by the union) means a new filter mode can't be half-added.
 */

import type { ProvenanceFilter } from '../@types/settings/ProvenanceFilter';

/**
 * Shader-side encoding, packed into the points `Uniforms` as a u32.  These
 * numbers are matched literally by `points/vertex.wesl`'s cull test — change
 * one side and the other must follow.
 */
export const PROVENANCE_FILTER_CODE: Record<ProvenanceFilter, number> = {
  all: 0,
  measured: 1,
  estimated: 2,
};

/** Menu order + labels for the DebugPanel's per-axis filter dropdown. */
export const PROVENANCE_FILTER_OPTIONS: readonly { value: ProvenanceFilter; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'measured', label: 'Measured' },
  // Label says "missing" (what the source catalog lacks); value stays
  // 'estimated' (what the pipeline put there instead).
  { value: 'estimated', label: 'Missing' },
];
