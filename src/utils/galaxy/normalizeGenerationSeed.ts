/**
 * The generation chain's seed rule, from the spike's `model.js`. Anything
 * that has to reproduce a galaxy's placement — `packGenerationUniforms`'s two
 * streams, and the CPU-side dust/bubble/ISM-map builders — must agree on it
 * exactly, since the same params must yield the same galaxy on both sides.
 *
 * `| 0` truncates toward zero and wraps to int32; `|| 1` then maps 0 (and an
 * absent seed) to 1, because a zero state makes `mulberry32` degenerate.
 * Signed, deliberately: the UBO's own `>>> 0` reinterpretation is applied at
 * the pack site, not here, so a CPU builder and the shader stream that shares
 * this seed cannot disagree about it.
 */
export function normalizeGenerationSeed(seed: number | undefined): number {
  return (seed ?? 0) | 0 || 1;
}
