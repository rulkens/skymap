import type { ProvenanceAxisId } from './ProvenanceAxisId';
import type { ProvenanceAxisSettings } from './ProvenanceAxisSettings';

/**
 * GalaxyProvenanceSettings — highlight + filter state for every provenance
 * axis, keyed by the registry id.
 *
 * A total `Record` (not a `Partial`) so a new entry in `PROVENANCE_AXES`
 * breaks the build at the defaults until its state is defined — a missing key
 * would otherwise read as `undefined` at the uniform packer and silently pack
 * a zero.
 */
export type GalaxyProvenanceSettings = Record<ProvenanceAxisId, ProvenanceAxisSettings>;
