import type { PROVENANCE_AXES } from '../../data/provenanceAxes';

/**
 * ProvenanceAxisId — the id of one row in the provenance registry, derived
 * from `PROVENANCE_AXES` rather than restated as a hand-written union.
 *
 * Deriving means a new axis is a single edit: add the registry entry and every
 * `Record<ProvenanceAxisId, …>` (settings, counts, the debug table) becomes a
 * compile error until it is filled in.
 */
export type ProvenanceAxisId = (typeof PROVENANCE_AXES)[number]['id'];
