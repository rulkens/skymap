import { SOURCE_REGISTRY } from '../../../data/sources';

/**
 * StructureCategory — the extended-structure POI categories that go through
 * the ring/halo marker pass and frame the camera by physical radius.
 *
 * Derived from the `type: 'structure'` rows of SOURCE_REGISTRY (each
 * structure source's readable `id`), so adding a structure source widens this
 * union automatically. This is `PoiCategory` minus `'famousGalaxy'`: famous
 * galaxies are galaxy data, not structures, so the structure store and its
 * records reject a famous-galaxy category at compile time.
 */
type StructureSourceRow = Extract<
  (typeof SOURCE_REGISTRY)[keyof typeof SOURCE_REGISTRY],
  { type: 'structure' }
>;

export type StructureCategory = StructureSourceRow['id'];
