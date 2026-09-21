/** AlbedoDelight — `delightedImagerySource`'s de-lighting knobs, named after
 *  the albedo bench that tuned them (`.superpowers/sdd/2026-09-17-terrain-f4-mars/
 *  albedo-bench-prototype/`): flatten a baked-in sun out of a photographic
 *  mosaic, relative to a coarse relief-shading field, so the mosaic no
 *  longer fights the renderer's own real-time lighting. */
export type AlbedoDelight = {
  /** Strength of the relief-shading removal, 0 = none, 1 = full flat-ground ratio. */
  readonly reliefShade: number;
  /** Azimuth (clockwise from north) and elevation of the mosaic's own baked-in sun. */
  readonly photoSunAzDeg: number;
  readonly photoSunElDeg: number;
  /** Multiplier on the coarse field's height gradient before it becomes a normal. */
  readonly reliefExaggeration: number;
  /** Strength of the low-frequency flattening, 0 = none, 1 = fully flat. */
  readonly flatten: number;
  /** Flattening low-pass radius, in degrees (converted to the coarse field's
   *  own pixel size at bake time — see `delightedImagerySource`). */
  readonly flattenRadiusDeg: number;
  /** Luminance above which the soft knee (`tame`) compresses highlights. */
  readonly knee: number;
  /** Soft-knee compression strength above `knee`, 0 = none. */
  readonly tame: number;
  /** Strength of undoing the flatten/knee over bright, colourless, polar pixels
   *  (polar ice caps), 0 = none. */
  readonly keepIce: number;
};
