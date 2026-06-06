import { SOURCE_REGISTRY } from '../../../data/sources';

/**
 * StructureCategory — the extended-structure POI categories that go through
 * the ring/halo marker pass and frame the camera by physical radius.
 *
 * Derived from the `type: 'poi'` rows of SOURCE_REGISTRY (each POI source's
 * readable `id`), so adding a POI source widens this union automatically.
 * This is `PoiCategory` minus `'famousGalaxy'`: famous galaxies are galaxy
 * data, not structures, so the structure store and its records reject a
 * famous-galaxy category at compile time.
 */
type PoiSourceRow = Extract<
  (typeof SOURCE_REGISTRY)[keyof typeof SOURCE_REGISTRY],
  { type: 'poi' }
>;

export type StructureCategory = PoiSourceRow['id'];
