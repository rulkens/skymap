import type { SOURCE_REGISTRY } from '../../../data/sources';

type AnyEntry = (typeof SOURCE_REGISTRY)[keyof typeof SOURCE_REGISTRY];

/**
 * StructureId — the source-level id for the structure source type
 * (cluster / supercluster / void / group). It is the exact parallel of
 * `GalaxyCatalogId` and `VolumeFieldId`: the key domain for structure
 * settings, fades, and marker buckets. Derived from the `type: 'structure'`
 * registry rows, so a new structure source widens the union automatically.
 *
 * Distinct from the per-record `StructureInfo.id` (e.g. `"A2703"`), which
 * identifies a single structure within a source; this id names the source
 * itself. The runtime iterable companion is `STRUCTURE_IDS` in
 * `data/structure/structureIds`.
 */
export type StructureId = Extract<AnyEntry, { readonly type: 'structure' }>['id'];
