/**
 * GenerationLayout — the full carved slot map for one `generateGalaxy` run,
 * built once on the CPU (`carveStarLayout`/`carveDustLayout`) before any GPU
 * compute pass dispatches. Carving is CPU-side because the per-category
 * population mix (does this galaxy have a bar? arms? a dust ring?) and every
 * count formula it feeds (`floor(diskCount*0.35)`, `floor(30000*dust/g²)`,
 * etc.) depend only on `GalaxyParams`/`GalaxyCategory`/`StarBudget` — none of
 * it needs a single random draw or GPU round-trip. The alternative, carving
 * slot ranges *inside* a compute shader from the same formulas, would mean
 * duplicating this arithmetic in WGSL and losing the ability to unit-test it
 * against the CPU model in plain TypeScript.
 *
 * `ranges` is ascending and contiguous (`ranges[i+1].start === ranges[i].start
 * + ranges[i].iterations*ranges[i].stride`) with zero-iteration populations
 * omitted entirely, so a consumer can dispatch one compute pass per range
 * without gaps or an explicit "is this population present" check.
 */
import type { PopulationRange } from './PopulationRange';

export type GenerationLayout = {
  readonly ranges: readonly PopulationRange[];
  readonly capacity: number;
};
