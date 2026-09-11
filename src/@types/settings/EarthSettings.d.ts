/**
 * EarthSettings — Earth's per-body look dials, each seeded from the data file
 * that owns its default. `ambientLight` (night-side floor) and `oceanRoughness`
 * (GGX, how broad the sun glint reads) shadow a WESL const of the same value —
 * `AMBIENT` in `bodyLighting.wesl`, `OCEAN_ROUGHNESS` in `lib/pbr.wesl` — each
 * of which still governs every OTHER body.
 */

export type EarthSettings = {
  atmosphereExposure: number;
  ambientLight: number;
  oceanRoughness: number;
};
