/**
 * ScalarFieldHandle — opaque per-field identifier used by
 * `ScalarVolumeRenderer` to address registered scalar-volume cubes.
 *
 * Kept as a string alias rather than a branded type because the values
 * are user-facing settings keys (e.g. `'mcpm'`, `'cf4'`, `'rhizome'`)
 * and the registry lookup is the only check that matters at runtime.
 */
export type ScalarFieldHandle = string;
