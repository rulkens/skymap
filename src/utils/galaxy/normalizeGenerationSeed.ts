/**
 * The generation chain's seed rule, from the spike's `model.js`. Every path
 * that must reproduce a galaxy's placement — `describeGalaxy.ts`'s streams,
 * the CPU dust/bubble/ISM-map builders — applies this exact rule.
 *
 * `| 0` truncates to int32; `|| 1` maps a zero seed to 1 (mulberry32
 * degenerates at zero). Left signed: the UBO's `>>> 0` reinterpretation
 * happens at the pack site, not here.
 */
export function normalizeGenerationSeed(seed: number | undefined): number {
  return (seed ?? 0) | 0 || 1;
}
