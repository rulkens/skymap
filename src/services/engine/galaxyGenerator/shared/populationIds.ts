/**
 * POPULATION_IDS — the fixed numeric id every population carries across the
 * CPU/GPU seam: `carveStarLayout`/`carveDustLayout` stamp these onto each
 * `PopulationRange`, and the GPU compute passes (later tasks) switch on the
 * same ids to pick which formula an invocation runs. A plain frozen object
 * (not an enum, not a per-population string key scattered across call sites)
 * so there is exactly one place that assigns the numbers — the ids are
 * load-bearing (they cross a CPU/GPU boundary as plain integers, the same
 * append-only-id hygiene `sources.ts` documents for the point renderer's
 * source codes), so renumbering one after this ships would silently desync
 * already-compiled shader code from the CPU-side table.
 *
 * `globularCluster` (6) is the per-cluster loop that draws each cluster's
 * centre/radius/hue — it owns no output slots of its own and never appears
 * in a carved layout. `globularStar` (7) is the population that actually
 * gets GPU slots: `clusterCount * 90` star records, one iteration per star
 * rather than per cluster (`stride: 1`, `iterations: clusterCount * 90` —
 * see `carveStarLayout`).
 */

export const POPULATION_IDS = Object.freeze({
  bulge: 0,
  bar: 1,
  disk: 2,
  spiralArms: 3,
  irregularClumps: 4,
  halo: 5,
  globularCluster: 6,
  globularStar: 7,
  armDust: 8,
  barDust: 9,
  lenticularNucDust: 10,
  lenticularRingDust: 11,
  irregularDust: 12,
});
