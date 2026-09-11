/**
 * EarthSettings — Earth's per-body look dials. Each field stays the data
 * file's single source of truth for its default (the same relationship the
 * tonemap exposure default has to `DEFAULT_EXPOSURE`).
 */

export type EarthSettings = {
  /**
   * Exposure scale on the in-scatter atmosphere shell's HDR output. Seeded
   * from `ATMOSPHERE_PARAMS.earth.exposure` and read live by
   * `atmosphereShellPass` each frame.
   */
  atmosphereExposure: number;
  /**
   * Night-side ambient floor lifting Earth's unlit hemisphere off pure
   * black (earthshine / moonlight, physically). Seeded from
   * `EARTH_SURFACE_PARAMS.ambientLight` — the SAME value as the shared
   * `AMBIENT` const in `bodyLighting.wesl`, but Earth-scoped: that const
   * stays the floor for every OTHER lit body, this overrides it for Earth
   * alone. Read live by `earthPass` + `cloudShellPass` each frame.
   */
  ambientLight: number;
  /**
   * The GGX perceptual roughness the material mask selects wholesale for
   * open water — the dial that sets how broad the ocean sun glint reads.
   * Seeded from `EARTH_SURFACE_PARAMS.oceanRoughness` — the SAME value as
   * the `OCEAN_ROUGHNESS` const in `lib/pbr.wesl`, but Earth-scoped: that
   * const stays the seed / documentation home (and any future non-Earth
   * water), this overrides it for Earth alone. Read live by `earthPass`
   * each frame.
   */
  oceanRoughness: number;
};
