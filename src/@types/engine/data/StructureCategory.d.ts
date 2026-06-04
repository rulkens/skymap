/**
 * StructureCategory — the extended-structure POI categories that go through
 * the ring/halo marker pass and frame the camera by physical radius.
 *
 * This is `PoiCategory` minus `'famousGalaxy'`: famous galaxies are galaxy
 * data, not structures, so the structure store and its records never speak
 * that category.  Keeping it as its own narrow alias lets the structure
 * layer's types reject a famous-galaxy category at compile time.
 */

/** Extended-structure category — cluster / supercluster / void / group. */
export type StructureCategory = 'cluster' | 'supercluster' | 'void' | 'group';
