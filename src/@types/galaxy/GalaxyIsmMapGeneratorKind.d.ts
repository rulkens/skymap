/**
 * GalaxyIsmMapGeneratorKind — which pipeline writes `GalaxyFieldTuning.ismMap`'s
 * output artifact this rebuild: `'none'` (no simulation runs, no map exists —
 * every consumer's existing no-map fallback applies), or the advected-density
 * fluid generator (`GalaxyIsmMapFluidParams`, `ismMapFluidStep.wesl`). CPU
 * consumers `hiiRegions.ts` and `dustParticleCloud.ts` read
 * `tuning.ismMap.generator` directly to gate on the fluid event log they
 * source region candidates and placement from.
 */
export type GalaxyIsmMapGeneratorKind = 'none' | 'fluid';
