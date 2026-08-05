/**
 * GalaxySfMap — one CPU-side readback of the SSPSF automaton's packed output
 * (`sfMapPack.wesl`): a log-polar RGBA grid, already decoded from the
 * texture's rgba16float storage to LINEAR floats — R=gas fraction, G=recent
 * SF, B=older activity, A=dust (conserved via the snowplough rule; A may
 * exceed 1.0, see `sfMapPack.wesl`'s header). `data` is TIGHTLY packed (4
 * floats per texel, row-major, no GPU `copyTextureToBuffer` row-alignment
 * padding or f16 bit pattern) — see the galaxy tool's `createSfMapReadbacks`
 * for where both get stripped/decoded. `rMin`/`rMax` are the log-radial
 * bounds THIS readback's grid was built over (`sfMapGridRadius`), needed to
 * invert `sfMapRingRadius` when sampling.
 */
export type GalaxySfMap = {
  readonly az: number;
  readonly rings: number;
  readonly rMin: number;
  readonly rMax: number;
  readonly data: Float32Array;
};
