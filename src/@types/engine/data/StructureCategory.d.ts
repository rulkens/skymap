import { SOURCE_REGISTRY } from '../../../data/sources';

/**
 * StructureCategory — the marker-ring categories (cluster / supercluster /
 * void / group), derived from SOURCE_REGISTRY's `type: 'structure'` rows so it
 * widens automatically when a structure source is added. `PoiCategory` minus
 * `'famousGalaxy'` (galaxy data, not a structure), so the structure store
 * rejects a famous-galaxy category at compile time.
 */
type StructureSourceRow = Extract<
  (typeof SOURCE_REGISTRY)[keyof typeof SOURCE_REGISTRY],
  { type: 'structure' }
>;

export type StructureCategory = StructureSourceRow['id'];
