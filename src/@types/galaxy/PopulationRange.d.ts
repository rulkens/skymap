/**
 * PopulationRange — one population's contiguous slice of a carved
 * `GenerationLayout`. `start`/`iterations`/`stride` are exactly what a GPU
 * compute pass needs to dispatch over the population's slots without any
 * CPU-side branching per invocation: `invocationIndex` in
 * `[start, start + iterations*stride)` maps back to `(popId, i, slotInStride)`
 * via `i = floor((invocationIndex - start) / stride)` and
 * `slotInStride = (invocationIndex - start) % stride`.
 *
 * `iterations` mirrors the CPU builder's *loop bound*, not its final written
 * record count — a builder like `buildSpiralArms` can skip records inside the
 * loop (density-gap `continue`) or write extra ones (HII bonus stars) without
 * changing how many *slots* the layout reserves for it. The GPU pass is
 * expected to write into every reserved slot (with a "this slot is empty"
 * sentinel where the CPU model would have skipped), not to compact around
 * gaps — that keeps `start` for every later population a pure prefix sum
 * over `iterations*stride`, computable before any population actually runs.
 */

export type PopulationRange = {
  readonly popId: number;
  readonly start: number;
  readonly iterations: number;
  readonly stride: number;
};
