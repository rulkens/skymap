/**
 * POPULATION_IDS — the fixed numeric id each population carries across the
 * CPU/GPU seam. `carveStarLayout`/`carveDustLayout` stamp these onto each
 * `PopulationRange`; the GPU compute passes switch on the same ids to pick a
 * formula. Append-only, like `sources.ts`'s source codes: renumbering one
 * after this ships desyncs already-compiled shader code from this table.
 *
 * `globularCluster` (6) is the per-cluster loop (centre/radius/hue) — it
 * owns no output slots and never appears in a carved layout. `globularStar`
 * (7) is the population that gets GPU slots: `clusterCount * 90` star
 * records, one iteration per star (`stride: 1`, see `carveStarLayout`).
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
