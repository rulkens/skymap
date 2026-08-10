/**
 * GalaxyIsmMap — one CPU-side readback of the fluid generator's packed
 * output (`ismMapFluidPack.wesl`), decoded from rgba16float storage to
 * LINEAR floats. `data` is TIGHTLY packed (4 floats/texel, row-major, no
 * GPU `copyTextureToBuffer` row-alignment padding or f16 bit pattern) — see
 * the galaxy tool's `createIsmMapReadbacks` for where both get
 * stripped/decoded. `rMin`/`rMax` are the log-radial bounds this readback's
 * grid was built over (`ismMapGridRadius`), needed to invert
 * `ismMapRingRadius` when sampling.
 *
 * CONTRACT (the generator's GPU ping-pong state texel AND this readback's
 * packed layout — `ismMapFluidStep.wesl`/`ismMapFluidPack.wesl` point back
 * here rather than restating it):
 *
 *   state (ping-pong, internal): x gas | y a MATERIAL stars tracer (advected
 *     the same as gas/dust, deposited at SF events proportional to local
 *     gas, decaying per step — the placement field for the young-stars
 *     chain tier) | z activity (EMA of event stamps) | w dust
 *     (advected/snowploughed, ambient pedestal 1)
 *   packed (this readback):      R gas | G stars, the tracer, straight
 *     unclamped copy | B activity (clamped 0..1) | A dust (conserved via the
 *     snowplough rule; may exceed 1.0)
 *
 * All four rgba16float slots are occupied — a fifth channel needs a second
 * output texture (`IsmMapOutput`) + decode, not a slot squeeze here.
 */
export type GalaxyIsmMap = {
  readonly az: number;
  readonly rings: number;
  readonly rMin: number;
  readonly rMax: number;
  readonly data: Float32Array;
};
