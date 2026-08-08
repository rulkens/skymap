/**
 * GalaxyIsmMap — one CPU-side readback of the SSPSF automaton's packed output
 * (`ismMapPack.wesl`/`ismMapFluidPack.wesl`), decoded from rgba16float storage
 * to LINEAR floats. `data` is TIGHTLY packed (4 floats/texel, row-major, no
 * GPU `copyTextureToBuffer` row-alignment padding or f16 bit pattern) — see
 * the galaxy tool's `createIsmMapReadbacks` for where both get
 * stripped/decoded. `rMin`/`rMax` are the log-radial bounds this readback's
 * grid was built over (`ismMapGridRadius`), needed to invert
 * `ismMapRingRadius` when sampling.
 *
 * CONTRACT (both generators' GPU ping-pong state texel AND this readback's
 * packed layout — the step/pack shaders point back here rather than
 * restating it: `ismMapAutomatonStep.wesl`, `ismMapFluidStep.wesl`,
 * `ismMapPack.wesl`, `ismMapFluidPack.wesl`):
 *
 *   state (ping-pong, internal): x gas | y STARS, generator-specific — fluid:
 *     a MATERIAL tracer (advected the same as gas/dust, deposited at SF
 *     events proportional to local gas, decaying per step — the placement
 *     field for the young-stars chain tier); automaton: `eventAge`, an
 *     EULERIAN clock (steps since event core; load-bearing refractory-gating
 *     state, see `ismMapAutomatonStep.wesl`) | z activity (EMA of event
 *     stamps / ignition trace) | w dust (advected/snowploughed, ambient
 *     pedestal 1)
 *   packed (this readback):      R gas | G stars — fluid: the tracer,
 *     straight unclamped copy; automaton: `exp(-eventAge/tau)`, that
 *     generator's own documented APPROXIMATION of the fluid tracer, not the
 *     tracer itself | B activity (clamped 0..1) | A dust (conserved via the
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
