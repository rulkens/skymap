/**
 * MilkyWayCloudBuffers — the GPU-filled instance buffers one generation pass
 * produced for the Milky Way point cloud, plus their draw-time instance
 * counts. This is what `MilkyWayCloud.buffers()` hands the draw side each
 * frame; it is a plain snapshot of the current generation, replaced wholesale
 * on every tier switch rather than mutated in place.
 *
 * `starCount`/`dustCount` are the carved layout CAPACITIES, not a tally of
 * "live" (visibly nonzero) records — a population's `iterations` is its CPU
 * builder's loop bound, and some slots write a zero-brightness/opacity record
 * (a dead star past its fade radius) without shrinking the layout. The draw
 * pass instances every capacity slot; a dead one rasterizes a zero-area quad,
 * so nothing draws wrong (see `createGalaxyEngine.ts`'s `setParams` docblock
 * for the same reasoning on the tool side).
 *
 * `dustBuf` is nullable: a galaxy category ineligible for dust (elliptical, or
 * `spriteDust <= 0`) carves an empty dust layout and gets no buffer. The
 * Milky Way preset (SBb, `spriteDust = 0.5`) always carves dust, so this is
 * null-in-principle rather than null-in-practice — but the type stays honest
 * so a future preset change can't silently produce an invalid zero-size
 * buffer.
 */
export type MilkyWayCloudBuffers = {
  readonly starBuf: GPUBuffer;
  readonly starCount: number;
  readonly dustBuf: GPUBuffer | null;
  readonly dustCount: number;
};
